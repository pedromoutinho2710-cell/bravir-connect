-- Add 'trade' value to the app_role enum so the UI role offering is valid
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trade';
