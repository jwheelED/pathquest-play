/* @ds-bundle: {"format":3,"namespace":"EdvanaDesignSystem_5bb0a0","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"StatPill","sourcePath":"components/core/StatPill.jsx"},{"name":"McqOption","sourcePath":"components/live/McqOption.jsx"},{"name":"ProgressBar","sourcePath":"components/live/ProgressBar.jsx"},{"name":"RoomSignal","sourcePath":"components/live/RoomSignal.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"6ee11e29867b","components/core/Button.jsx":"3759a93208ea","components/core/Card.jsx":"739170bec49c","components/core/Input.jsx":"921228a044b9","components/core/StatPill.jsx":"65a2e7d0abe3","components/live/McqOption.jsx":"75fd4068eda5","components/live/ProgressBar.jsx":"3d8734952b1a","components/live/RoomSignal.jsx":"f7faf6c326da"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.EdvanaDesignSystem_5bb0a0 = window.EdvanaDesignSystem_5bb0a0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana Badge — small status / category pill.
 */
function Badge({
  variant = "default",
  className = "",
  style = {},
  children,
  ...props
}) {
  const variants = {
    default: {
      background: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))"
    },
    secondary: {
      background: "hsl(var(--secondary))",
      color: "hsl(var(--secondary-foreground))"
    },
    soft: {
      background: "hsl(var(--emerald-50))",
      color: "hsl(var(--emerald-700))",
      border: "1px solid hsl(var(--emerald-100))"
    },
    outline: {
      background: "transparent",
      color: "hsl(var(--text-muted))",
      border: "1px solid hsl(var(--border))"
    },
    info: {
      background: "hsl(var(--sky-50))",
      color: "hsl(var(--sky-600))",
      border: "1px solid hsl(var(--sky-100))"
    },
    warning: {
      background: "hsl(45 93% 92%)",
      color: "hsl(38 80% 32%)"
    },
    danger: {
      background: "hsl(0 84% 60%)",
      color: "#fff"
    },
    live: {
      background: "hsl(var(--emerald-50))",
      color: "hsl(var(--emerald-700))",
      border: "1px solid hsl(var(--emerald-100))"
    }
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.25rem 0.625rem",
    borderRadius: "var(--radius-full)",
    fontFamily: "var(--font-sans)",
    fontSize: "11px",
    fontWeight: "var(--weight-semibold)",
    letterSpacing: "0.02em",
    lineHeight: 1.4,
    border: "1px solid transparent",
    ...variants[variant],
    ...style
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `edv-badge edv-badge--${variant} ${className}`,
    style: base
  }, props), variant === "live" && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "hsl(var(--emerald-500))",
      animation: "edv-pulse 2s ease-in-out infinite"
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana Button — friendly pill-shaped action.
 * Calm by default; gradient/gamified variants reserved for celebratory moments.
 */
function Button({
  variant = "primary",
  size = "md",
  pill = true,
  asChild = false,
  className = "",
  style = {},
  children,
  ...props
}) {
  const radius = pill ? "var(--radius-full)" : "var(--radius-md)";
  const sizes = {
    sm: {
      height: 36,
      padding: "0 14px",
      fontSize: "var(--text-sm)"
    },
    md: {
      height: 44,
      padding: "0 24px",
      fontSize: "var(--text-sm)"
    },
    lg: {
      height: 48,
      padding: "0 32px",
      fontSize: "var(--text-base)"
    },
    xl: {
      height: 52,
      padding: "0 40px",
      fontSize: "var(--text-lg)"
    },
    icon: {
      height: 40,
      width: 40,
      padding: 0
    }
  };
  const variants = {
    primary: {
      background: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
      border: "1px solid transparent",
      boxShadow: "var(--shadow-sm)"
    },
    secondary: {
      background: "hsl(var(--secondary))",
      color: "hsl(var(--secondary-foreground))",
      border: "1px solid transparent"
    },
    outline: {
      background: "transparent",
      color: "hsl(220 20% 18%)",
      border: "1px solid hsl(var(--border))"
    },
    ghost: {
      background: "transparent",
      color: "hsl(var(--text-muted))",
      border: "1px solid transparent"
    },
    danger: {
      background: "transparent",
      color: "hsl(var(--danger))",
      border: "1px solid hsl(0 84% 60% / 0.3)"
    },
    link: {
      background: "transparent",
      color: "hsl(var(--primary))",
      border: "none",
      textDecoration: "underline",
      textUnderlineOffset: "4px"
    }
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--weight-semibold)",
    lineHeight: 1,
    whiteSpace: "nowrap",
    borderRadius: radius,
    cursor: "pointer",
    transition: "all 0.2s var(--ease-smooth)",
    ...sizes[size],
    ...variants[variant],
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    className: `edv-btn edv-btn--${variant} ${className}`,
    style: base
  }, props), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana Card — the calm white surface used across the product.
 * `command` and `headspace` are near-identical hairline-bordered cards;
 * `signal` is lighter (used for compact live-metric tiles);
 * `bento` is borderless with a softer, larger shadow.
 */
function Card({
  variant = "command",
  padding = 24,
  className = "",
  style = {},
  children,
  ...props
}) {
  const variants = {
    command: {
      background: "hsl(var(--white))",
      border: "var(--card-border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)"
    },
    headspace: {
      background: "hsl(var(--white))",
      border: "var(--card-border)",
      borderRadius: "var(--radius-2xl)",
      boxShadow: "var(--shadow-sm)"
    },
    signal: {
      background: "hsl(var(--white))",
      border: "1px solid hsl(220 15% 92%)",
      borderRadius: "var(--radius-md)",
      boxShadow: "0 1px 2px 0 hsl(var(--ink) / 0.02)"
    },
    bento: {
      background: "hsl(var(--white))",
      border: "0",
      borderRadius: "var(--radius-2xl)",
      boxShadow: "var(--shadow-md)"
    }
  };
  const base = {
    padding,
    transition: "box-shadow 0.2s var(--ease-smooth)",
    ...variants[variant],
    ...style
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `edv-card edv-card--${variant} ${className}`,
    style: base
  }, props), children);
}
function CardHeader({
  eyebrow,
  title,
  description,
  action,
  style = {},
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.6875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      color: "hsl(160 50% 38%)",
      marginBottom: 6
    }
  }, eyebrow), title && /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-xl)",
      fontWeight: 600,
      letterSpacing: "var(--tracking-tight)",
      color: "hsl(220 20% 18%)"
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: "var(--text-sm)",
      color: "hsl(var(--text-muted))",
      lineHeight: 1.5
    }
  }, description)), action);
}
Object.assign(__ds_scope, { Card, CardHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana Input — rounded text field. Pill (`rounded`) for inline session-title
 * style fields, soft `md` for forms. Emerald focus ring.
 */
function Input({
  rounded = false,
  invalid = false,
  className = "",
  style = {},
  ...props
}) {
  const [focused, setFocused] = React.useState(false);
  const base = {
    height: 44,
    width: "100%",
    padding: rounded ? "0 20px" : "0 14px",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    color: "hsl(var(--text-body))",
    background: "hsl(var(--white))",
    border: `1px solid ${invalid ? "hsl(var(--danger))" : focused ? "hsl(var(--emerald-300))" : "hsl(var(--border))"}`,
    borderRadius: rounded ? "var(--radius-full)" : "var(--radius-sm)",
    outline: "none",
    boxShadow: focused ? "0 0 0 3px hsl(var(--emerald-200) / 0.4)" : "none",
    transition: "border-color 0.15s var(--ease-smooth), box-shadow 0.15s var(--ease-smooth)",
    boxSizing: "border-box",
    ...style
  };
  return /*#__PURE__*/React.createElement("input", _extends({
    className: `edv-input ${className}`,
    style: base,
    onFocus: e => {
      setFocused(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocused(false);
      props.onBlur?.(e);
    }
  }, props));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/StatPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana StatPill — a small floating metric chip (icon + value + label),
 * used for participant counts, response rates, streaks, etc.
 */
function StatPill({
  icon,
  value,
  label,
  tone = "neutral",
  className = "",
  style = {},
  ...props
}) {
  const tones = {
    neutral: {
      color: "hsl(var(--text-body))",
      iconColor: "hsl(var(--text-subtle))"
    },
    emerald: {
      color: "hsl(var(--emerald-700))",
      iconColor: "hsl(var(--emerald-600))"
    },
    sky: {
      color: "hsl(var(--sky-600))",
      iconColor: "hsl(var(--sky-400))"
    },
    amber: {
      color: "hsl(38 80% 32%)",
      iconColor: "hsl(var(--amber-strong))"
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: `edv-statpill ${className}`,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.5rem 1rem",
      borderRadius: "var(--radius-full)",
      background: "hsl(var(--white))",
      boxShadow: "var(--shadow-sm)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      ...style
    }
  }, props), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      color: t.iconColor
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: "var(--weight-bold)",
      color: t.color
    }
  }, value), label && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "hsl(var(--text-muted))"
    }
  }, label));
}
Object.assign(__ds_scope, { StatPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatPill.jsx", error: String((e && e.message) || e) }); }

// components/live/McqOption.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana McqOption — a single multiple-choice answer row with a letter chip.
 * State drives the color: idle / selected / correct / incorrect.
 */
function McqOption({
  label,
  children,
  state = "idle",
  onClick,
  className = "",
  style = {},
  ...props
}) {
  const states = {
    idle: {
      border: "1px solid hsl(var(--border))",
      background: "hsl(var(--white))",
      chipBg: "hsl(var(--slate-100))",
      chipColor: "hsl(var(--text-muted))",
      text: "hsl(var(--text-body))"
    },
    selected: {
      border: "2px solid hsl(var(--primary))",
      background: "hsl(var(--primary) / 0.06)",
      chipBg: "hsl(var(--primary))",
      chipColor: "#fff",
      text: "hsl(var(--text-body))"
    },
    correct: {
      border: "2px solid hsl(var(--primary))",
      background: "hsl(var(--primary) / 0.08)",
      chipBg: "hsl(var(--primary))",
      chipColor: "#fff",
      text: "hsl(var(--emerald-800))"
    },
    incorrect: {
      border: "2px solid hsl(var(--danger))",
      background: "hsl(0 84% 60% / 0.06)",
      chipBg: "hsl(var(--danger))",
      chipColor: "#fff",
      text: "hsl(var(--text-body))"
    }
  };
  const s = states[state] || states.idle;
  const pad = state === "idle" ? "13px 14px" : "12px 13px"; // compensate 1px→2px border
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    className: `edv-mcq edv-mcq--${state} ${className}`,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      width: "100%",
      textAlign: "left",
      padding: pad,
      borderRadius: "var(--radius-lg)",
      border: s.border,
      background: s.background,
      color: s.text,
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      cursor: onClick ? "pointer" : "default",
      transition: "all 0.18s var(--ease-smooth)",
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: "none",
      width: 26,
      height: 26,
      borderRadius: "50%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 700,
      background: s.chipBg,
      color: s.chipColor
    }
  }, label), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { McqOption });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/live/McqOption.jsx", error: String((e && e.message) || e) }); }

// components/live/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana ProgressBar — slim rounded track with an emerald fill.
 * Used for understanding health, response progress, lesson completion.
 */
function ProgressBar({
  value = 0,
  tone = "emerald",
  height = 8,
  showLabel = false,
  className = "",
  style = {},
  ...props
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fills = {
    emerald: "hsl(var(--emerald-600))",
    sky: "hsl(var(--sky-400))",
    amber: "hsl(var(--amber-strong))",
    gradient: "var(--gradient-primary)"
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `edv-progress ${className}`,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height,
      background: "hsl(var(--slate-100))",
      borderRadius: "var(--radius-full)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      background: fills[tone] || fills.emerald,
      borderRadius: "var(--radius-full)",
      transition: "width 0.5s var(--ease-out-soft)"
    }
  })), showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      fontWeight: 600,
      color: "hsl(var(--text-muted))",
      minWidth: 34,
      textAlign: "right"
    }
  }, pct, "%"));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/live/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/live/RoomSignal.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Edvana RoomSignal — the live response distribution shown to instructors.
 * Vertical bars per option with percentage labels; the correct option is
 * emerald-highlighted. The whole point of Edvana: see the room instantly.
 */
function RoomSignal({
  options = [],
  correctLabel,
  height = 96,
  className = "",
  style = {},
  ...props
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `edv-roomsignal ${className}`,
    style: {
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, props), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: "0.75rem",
      height
    }
  }, options.map(o => {
    const hot = correctLabel ? o.label === correctLabel : o.highlight;
    return /*#__PURE__*/React.createElement("div", {
      key: o.label,
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        height: "100%",
        justifyContent: "flex-end"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: hot ? "hsl(var(--emerald-600))" : "hsl(var(--text-muted))"
      }
    }, o.pct, "%"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "100%",
        height: `${o.pct}%`,
        minHeight: 8,
        borderRadius: "var(--radius-sm)",
        background: hot ? "hsl(var(--emerald-600))" : "hsl(var(--slate-200))",
        transition: "height 0.5s var(--ease-out-soft)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "hsl(var(--text-muted))"
      }
    }, o.label));
  })));
}
Object.assign(__ds_scope, { RoomSignal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/live/RoomSignal.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.StatPill = __ds_scope.StatPill;

__ds_ns.McqOption = __ds_scope.McqOption;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.RoomSignal = __ds_scope.RoomSignal;

})();
