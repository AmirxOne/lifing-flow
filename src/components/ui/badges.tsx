import { cn } from "@/lib";

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: "gray" | "green" | "red" | "amber" | "blue" | "black";
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>;
}
