-- Force update the bucket with explicit settings
UPDATE storage.buckets 
SET file_size_limit = 209715200,
    avif_autodetection = false,
    allowed_mime_types = ARRAY['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/png', 'image/jpeg', 'image/gif', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
WHERE id = 'lecture-materials';