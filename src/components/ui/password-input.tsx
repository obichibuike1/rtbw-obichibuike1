import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Tint for the eye icon — "default" uses primary, "admin" uses a subtle teal/grey. */
  eyeVariant?: "default" | "admin";
  /** When true, hides characters as ••• even when "visible"; used for PIN masking display. */
  containerClassName?: string;
}

/**
 * Password input with an inline eye toggle. Icon lives inside the field
 * on the right, has a 44x44px tap target, and never submits the form.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, containerClassName, eyeVariant = "default", ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const iconColor =
      eyeVariant === "admin"
        ? "text-slate-400 hover:text-teal-300"
        : "text-muted-foreground hover:text-primary";

    return (
      <TooltipProvider delayDuration={200}>
        <div className={cn("relative", containerClassName)}>
          <Input
            ref={ref}
            type={visible ? "text" : "password"}
            className={cn("pr-12", className)}
            {...props}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVisible((v) => !v);
                }}
                className={cn(
                  "absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center",
                  "min-w-11 min-h-11 h-11 w-11 rounded-md transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  iconColor,
                )}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {visible ? "Hide password" : "Show password"}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
