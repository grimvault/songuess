export async function searchItunes(term: string) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    term
  )}&entity=song&limit=100`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results.filter((t: any) => t.previewUrl).map((t: any) => ({
      id: t.trackId,
      name: t.trackName,
      artist: t.artistName,
      previewUrl: t.previewUrl,
      artworkUrl: t.artworkUrl100?.replace('100x100bb', '600x600bb'), // get high-res image
    }));
  } catch (error) {
    console.error("iTunes fetch error", error);
    return [];
  }
}
