
-- brand-assets bucket policies. Path convention: {user_id}/{brand_id}/{filename}
CREATE POLICY "Users read own brand assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own brand assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own brand assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own brand assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
