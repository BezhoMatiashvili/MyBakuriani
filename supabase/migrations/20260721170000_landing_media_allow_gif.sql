-- Allow animated GIF banners in admin media uploads (ads, banners, blog).
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm'
]
where id = 'landing-media';
