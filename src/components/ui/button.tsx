import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import * as React from "react";

/**
 * A cyberpunk button: the display face in uppercase, a cut corner, a stroke
 * that follows the cut, and — on hover — a second copy of its content torn
 * into strips over the first. The fill and the stroke are the variant.
 */
const buttonVariants = cva(
  "group/button cyber-frame inline-flex shrink-0 items-center justify-center border-0 font-display font-semibold text-sm uppercase tracking-[0.08em] whitespace-nowrap transition-colors outline-none select-none focus-visible:[--cyber-stroke:var(--color-foreground)] active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:text-muted-foreground disabled:[--cyber-fill:var(--color-muted)] disabled:[--cyber-stroke:var(--color-line)] disabled:opacity-70 aria-invalid:[--cyber-stroke:var(--color-destructive)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "text-primary-foreground [--cyber-fill:var(--color-cyber)] hover:[--cyber-fill:color-mix(in_oklab,var(--color-cyber)_85%,white)]",
        // A tint rather than a fill on hover: what a button holds may carry
        // colours of its own — a revenue in green, a share in grey — and a
        // solid accent behind them would swallow both.
        outline:
          "text-cyber [--cyber-fill:color-mix(in_oklab,var(--color-panel)_55%,transparent)] hover:[--cyber-fill:color-mix(in_oklab,var(--color-cyber)_16%,var(--color-panel))] hover:[--cyber-stroke:var(--color-foreground)] aria-expanded:[--cyber-fill:color-mix(in_oklab,var(--color-cyber)_16%,var(--color-panel))] aria-expanded:[--cyber-stroke:var(--color-foreground)]",
        secondary:
          "text-foreground [--cyber-stroke:var(--color-line)] [--cyber-fill:var(--color-secondary)] hover:[--cyber-stroke:var(--color-cyber)] aria-expanded:[--cyber-stroke:var(--color-cyber)]",
        ghost:
          "text-muted-foreground [--cyber-stroke:transparent] [--cyber-fill:transparent] hover:text-foreground hover:[--cyber-fill:var(--color-accent)] aria-expanded:text-foreground aria-expanded:[--cyber-fill:var(--color-accent)]",
        destructive:
          "text-cyber-hot [--cyber-stroke:var(--color-cyber-hot)] [--cyber-fill:color-mix(in_oklab,var(--color-cyber-hot)_12%,transparent)] hover:[--cyber-fill:color-mix(in_oklab,var(--color-cyber-hot)_28%,var(--color-panel))] focus-visible:[--cyber-stroke:var(--color-cyber-hot)]",
        link: "text-cyber underline-offset-4 [--cyber-stroke:transparent] [--cyber-fill:transparent] hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs [--cyber-corner:6px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem] [--cyber-corner:8px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 text-base [--cyber-corner:12px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 [--cyber-corner:8px]",
        "icon-xs": "size-6 [--cyber-corner:6px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 [--cyber-corner:7px]",
        "icon-lg": "size-9 [--cyber-corner:9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** The strip that closes the stroke across the cut corner, and the hover copy. */
function Trim({ copy }: { copy: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <span aria-hidden="true" className="cyber-corner" />
      {copy === null || copy === undefined ? null : (
        <span aria-hidden="true" className="cyber-glitch">
          {copy}
        </span>
      )}
    </>
  );
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const classes = cn(buttonVariants({ variant, size, className }));

  // The hover copy is for a button that is a word or two: torn strips of a
  // label read as a glitch, torn strips of an icon and three coloured
  // figures read as a mess. Anything else gets the tint alone.
  const glitchable = (content: React.ReactNode): React.ReactNode =>
    typeof content === "string" ? content : null;

  // `asChild` renders the child (a link, usually) as the button. The trim
  // goes inside it, and the hover copy is the child's own content.
  if (asChild) {
    const copy = React.isValidElement<{ children?: React.ReactNode }>(children)
      ? glitchable(children.props.children)
      : null;
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={classes}
        {...props}
      >
        <Slot.Slottable>{children}</Slot.Slottable>
        <Trim copy={copy} />
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      {...props}
    >
      {children}
      <Trim copy={glitchable(children)} />
    </button>
  );
}

export { Button, buttonVariants };
