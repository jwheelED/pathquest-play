import { supabase } from '@/integrations/supabase/client';

// Typed action types for offline queue
export type OfflineActionType = 
  | 'submit-live-response'
  | 'record-practice-attempt'
  | 'update-user-stats';

interface QueueItem {
  id: string;
  type: OfflineActionType;
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const DB_NAME = "edvana-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

// Maximum age for queued items (30 minutes)
const MAX_QUEUE_AGE_MS = 30 * 60 * 1000;
// Maximum retries before giving up
const MAX_RETRIES = 3;

// Sync handlers for each action type
const syncHandlers: Record<OfflineActionType, (data: Record<string, unknown>) => Promise<void>> = {
  'submit-live-response': async (data) => {
    // Check if already submitted (duplicate prevention)
    const { data: existing } = await supabase
      .from('live_responses')
      .select('id')
      .eq('question_id', data.questionId as string)
      .eq('participant_id', data.participantId as string)
      .maybeSingle();

    if (existing) {
      console.log('Response already synced, skipping');
      return;
    }

    const { error } = await supabase.functions.invoke('submit-live-response', { body: data });
    if (error) throw error;
  },
  
  'record-practice-attempt': async (data) => {
    const { error } = await supabase
      .from('practice_sessions')
      .insert(data as any);
    if (error) throw error;
  },
  
  'update-user-stats': async (data) => {
    const { error } = await supabase
      .from('user_stats')
      .upsert(data as any);
    if (error) throw error;
  }
};

class OfflineQueue {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
    });
  }

  async add(type: OfflineActionType, data: Record<string, unknown>): Promise<string> {
    if (!this.db) await this.init();

    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve(item.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<QueueItem[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async incrementRetry(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.retries += 1;
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineQueue = new OfflineQueue();

// Auto-sync when online
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    console.log("Back online, syncing queued actions...");
    
    try {
      const items = await offlineQueue.getAll();
      
      if (items.length === 0) {
        return;
      }
      
      let synced = 0;
      let failed = 0;
      
      for (const item of items) {
        try {
          // Skip stale items (older than 30 minutes)
          if (item.timestamp < Date.now() - MAX_QUEUE_AGE_MS) {
            console.log(`Skipping stale item: ${item.id}`);
            await offlineQueue.remove(item.id);
            continue;
          }
          
          // Get handler for this action type
          const handler = syncHandlers[item.type];
          if (!handler) {
            console.warn(`No handler for action type: ${item.type}`);
            await offlineQueue.remove(item.id);
            continue;
          }
          
          // Execute sync
          await handler(item.data);
          await offlineQueue.remove(item.id);
          synced++;
          console.log(`Synced item: ${item.id}`);
          
        } catch (error) {
          console.error("Failed to sync item:", item.id, error);
          await offlineQueue.incrementRetry(item.id);
          
          // Remove if too many retries
          if (item.retries >= MAX_RETRIES) {
            console.log(`Max retries reached for item: ${item.id}, removing`);
            await offlineQueue.remove(item.id);
            failed++;
          }
        }
      }
      
      // Dispatch event for UI to show notification
      if (synced > 0 || failed > 0) {
        window.dispatchEvent(new CustomEvent('offline-sync-complete', { 
          detail: { synced, failed } 
        }));
      }
      
    } catch (error) {
      console.error("Error during offline sync:", error);
    }
  });
}
