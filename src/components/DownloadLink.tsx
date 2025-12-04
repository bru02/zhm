import { DownloadSimple } from "phosphor-react";
import type { ReactNode } from "react";

type DownloadLinkProps = {
  href: string;
  children: ReactNode;
  downloadName?: string;
};

export default function DownloadLink({
  href,
  children,
  downloadName,
}: DownloadLinkProps) {
  return (
    <a
      className="download-link"
      href={href}
      download={downloadName ?? true}
      title="Download file"
      onClick={ev => ev.stopPropagation()}
    >
      <DownloadSimple
        aria-hidden
        className="download-icon"
        size={18}
        weight="bold"
      />
      <span className="download-label">{children}</span>
    </a>
  );
}
