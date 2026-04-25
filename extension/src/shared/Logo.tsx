interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 32, className = 'logo' }: LogoProps): JSX.Element {
  return (
    <div className={className}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="8" fill="#3B82F6" />
        <path d="M16 8L20 12H18V16H14V12H12L16 8Z" fill="white" />
        <path d="M8 24L12 20H10V16H6V20H4L8 24Z" fill="white" />
        <path d="M24 24L20 20H22V16H26V20H28L24 24Z" fill="white" />
      </svg>
    </div>
  );
}
