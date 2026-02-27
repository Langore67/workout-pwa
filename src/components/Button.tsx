import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
  size?: "default" | "small";
};

export function Button({
  variant = "default",
  size = "default",
  className = "",
  type,
  ...rest
}: Props) {
  const classes = [
    "btn",
    variant === "primary" ? "primary" : "",
    variant === "danger" ? "danger" : "",
    size === "small" ? "small" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type ?? "button"} className={classes} {...rest} />;
}
