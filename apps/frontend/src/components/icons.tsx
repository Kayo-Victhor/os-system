import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.2" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.2" />
    </Icon>
  );
}

export function IconOrders(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M8.5 3.5v-1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v1" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </Icon>
  );
}

export function IconCustomers(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.4 2.7-6 6.2-6s6.2 2.6 6.2 6" />
      <circle cx="17.5" cy="7.5" r="2.4" />
      <path d="M21.5 19c0-2.6-1.8-4.7-4.3-5.3" />
    </Icon>
  );
}

export function IconTechnician(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14.5 3.5 20.5 9.5 18 12 12 6l2.5-2.5Z" />
      <path d="M3.5 20.5 9 15" />
      <path d="M6.5 15.5 4 18a1.8 1.8 0 0 0 2.5 2.5L9 18" />
      <path d="M11 8 4 15" />
    </Icon>
  );
}

export function IconUsersAdmin(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3 4.5 6v5c0 4.6 3 8 7.5 10 4.5-2 7.5-5.4 7.5-10V6L12 3Z" />
      <path d="m9 12 2 2 4-4.5" />
    </Icon>
  );
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </Icon>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 5l14 14M19 5 5 19" />
    </Icon>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </Icon>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconAlert(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.3" r="0.15" fill="currentColor" />
    </Icon>
  );
}

export function IconEmpty(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="4" y="7" width="16" height="13" rx="1.5" />
      <path d="M4 11h16" />
      <path d="M8 4.5v5M16 4.5v5" />
    </Icon>
  );
}

export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}
