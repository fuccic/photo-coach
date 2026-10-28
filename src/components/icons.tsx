type IconProps = { size?: number; className?: string };

function Svg({ size = 22, className, children, strokeWidth = 1.8 }: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
  </Svg>
);

export const AddPhotoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
    <path d="M12 10v6M9 13h6" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11l8-7 8 7v9H4z" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" />
    <rect x="13" y="4" width="7" height="7" />
    <rect x="4" y="13" width="7" height="7" />
    <rect x="13" y="13" width="7" height="7" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 8v5M12 16.5v.01" />
    <circle cx="12" cy="12" r="9" />
  </Svg>
);
