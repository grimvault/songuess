export async function searchItunes(term: string) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    term
  )}&entity=song&limit=100`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results
      .filter((t: any) => t.previewUrl)
      .filter((t: any) => {
        const title = (t.trackName || '').toLowerCase();
        const artist = (t.artistName || '').toLowerCase();
        const album = (t.collectionName || '').toLowerCase();
        const combined = title + " " + artist + " " + album;
        if (combined.includes('workout') || combined.includes('karaoke') || combined.includes('tribute') || combined.includes('cover') || combined.includes('instrumental') || combined.includes('lullaby')) {
          return false;
        }
        return true;
      })
      .map((t: any) => ({
        id: t.trackId,
        name: t.trackName,
        artist: t.artistName,
        album: t.collectionName || "",
        year: t.releaseDate ? new Date(t.releaseDate).getFullYear().toString() : "",
        genre: t.primaryGenreName || "Unknown Genre",
        previewUrl: t.previewUrl,
        artworkUrl: t.artworkUrl100?.replace('100x100bb', '600x600bb'), // get high-res image
      }));
  } catch (error) {
    console.error("iTunes fetch error", error);
    return [];
  }
}
