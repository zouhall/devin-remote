// Hand-drawn lucide-style inline SVG icons (stroke-based, 24×24 grid).

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconLogo = (p: P) =>
  base(p, <path d="M6 4h7a8 8 0 0 1 0 16H6z" />);

export const IconPlus = (p: P) => base(p, <path d="M12 5v14M5 12h14" />);

export const IconSearch = (p: P) => base(p, <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>);

export const IconRefresh = (p: P) =>
  base(p, <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>);

export const IconPencil = (p: P) =>
  base(p, <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>);

export const IconDownload = (p: P) =>
  base(p, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>);

export const IconCopy = (p: P) =>
  base(p, <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>);

export const IconX = (p: P) => base(p, <path d="M18 6 6 18M6 6l12 12" />);

export const IconCheck = (p: P) => base(p, <path d="M20 6 9 17l-5-5" />);

export const IconMenu = (p: P) => base(p, <path d="M4 6h16M4 12h16M4 18h16" />);

export const IconSettings = (p: P) =>
  base(p, <><circle cx="12" cy="12" r="3" /><path d="M12 1v4m0 14v4M4.2 4.2l2.9 2.9m9.8 9.8 2.9 2.9M1 12h4m14 0h4M4.2 19.8l2.9-2.9m9.8-9.8 2.9-2.9" /></>);

export const IconChart = (p: P) => base(p, <><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M7 13v4M12 9v8M17 5v12" /></>);

export const IconTerminal = (p: P) =>
  base(p, <><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>);

export const IconScroll = (p: P) => base(p, <path d="M12 5v14m-7-7 7 7 7-7" />);

export const IconSend = (p: P) => base(p, <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>);

export const IconStop = (p: P) => base(p, <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />);

export const IconPaperclip = (p: P) =>
  base(p, <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />);

export const IconEdit = (p: P) =>
  base(p, <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>);

export const IconPlay = (p: P) => base(p, <polygon points="6 3 20 12 6 21 6 3" />);

export const IconRead = (p: P) =>
  base(p, <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>);

export const IconFetch = (p: P) =>
  base(p, <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>);

export const IconThink = (p: P) =>
  base(p, <><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /></>);

export const IconWrench = (p: P) =>
  base(p, <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />);

export const IconChevron = (p: P) => base(p, <path d="m9 18 6-6-6-6" />);

export const IconShield = (p: P) =>
  base(p, <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />);

export const IconCode = (p: P) => base(p, <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>);

export const IconAsk = (p: P) =>
  base(p, <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>);

export const IconPlan = (p: P) =>
  base(p, <><path d="M8 6h13M8 12h13M8 18h13" /><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" /></>);

export const IconZap = (p: P) => base(p, <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />);

export const IconCommand = (p: P) =>
  base(p, <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />);

export const IconFile = (p: P) =>
  base(p, <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></>);

export const IconSession = (p: P) =>
  base(p, <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>);

export const IconFolder = (p: P) =>
  base(p, <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />);

export const IconClock = (p: P) => base(p, <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);

export const IconCircle = (p: P) => base(p, <circle cx="12" cy="12" r="9" />);

export const IconDot = (p: P) => base(p, <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />);

export const IconAlert = (p: P) =>
  base(p, <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);

export const IconImage = (p: P) =>
  base(p, <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>);
