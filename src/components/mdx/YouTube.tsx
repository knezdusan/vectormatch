export function YouTube({ id }: { id: string }) {
  return (
    <div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
