import type { SVGProps } from "react";

export function DiyaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 17c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4v-2H4v2z" />
      <path d="M12 2a4 4 0 0 0-4 4c0 1.5.84 2.8 2 3.5V15h4v-5.5c1.16-.7 2-2 2-3.5a4 4 0 0 0-4-4z" />
    </svg>
  );
}
