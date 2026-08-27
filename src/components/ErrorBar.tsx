export default function ErrorBar({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-[3px] border-l-2 border-cinnabar bg-[#f9ede8] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#7c2d1a] whitespace-pre-wrap">
      {message}
    </div>
  );
}
