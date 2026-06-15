export function Logo({ subtitulo }: { subtitulo?: string }) {
  return (
    <div className="logo">
      <span className="logo-icono" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" fill="currentColor" />
        </svg>
      </span>
      <span className="logo-texto">
        <strong>MejoraTuTarifa</strong>
        {subtitulo && <small>{subtitulo}</small>}
      </span>
    </div>
  );
}
