import { z } from 'zod';

// Password validation schema with strong requirements
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Student signup validation schema
export const studentSignUpSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255, 'Email is too long'),
  password: passwordSchema,
  name: z.string().trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  phone: z.string().trim()
    .regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  age: z.number({ invalid_type_error: 'Age must be a number' })
    .int('Age must be a whole number')
    .min(13, 'Must be at least 13 years old')
    .max(120, 'Invalid age')
    .optional(),
  instructorCode: z.string().trim()
    .regex(/^[A-Z0-9]{6}$/, 'Instructor code must be exactly 6 characters (letters and numbers)')
    .optional()
    .or(z.literal(''))
});

// Instructor/Admin signup validation schema
export const instructorAdminSignUpSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255, 'Email is too long'),
  password: passwordSchema,
  name: z.string().trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
});

// Sign-in validation schema (less strict for password as it's already set)
export const signInSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255, 'Email is too long'),
  password: z.string().min(1, 'Password is required')
});
