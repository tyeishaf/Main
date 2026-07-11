"use client";

/** Bottom sheet primitive: scrim, rounded panel, drag handle. */
export default function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-plum/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#E0D3CC]" />
        {children}
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-mauve">
          Close
        </button>
      </div>
    </div>
  );
}
