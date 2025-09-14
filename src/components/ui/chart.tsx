'use client';

import * as React from 'react';
import {
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Lightweight, robust chart utilities and wrapper for Recharts elements.
 *
 * This file purposefully uses pragmatic `any` in a few places because
 * Recharts payload shapes are dynamic and very awkward to type precisely
 * without copying many library generics. The runtime checks ensure we
 * don't access undefined properties.
 */

/* -------------------------
   Types
   ------------------------- */

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType<any>;
  } & ({ color?: string; theme?: never } | { theme?: string; color?: never });
};

const EMPTY_CONFIG: ChartConfig = {};

/* -------------------------
   Helpers
   ------------------------- */

/**
 * Safely read config entry that may be referenced by payload or payload.payload.
 * Accepts `payload: any` because Recharts payload shapes vary.
 */
function getPayloadConfigFromPayload(config: ChartConfig, payload: any, key: string) {
  if (!payload || typeof payload !== 'object') return undefined;
  const nested = payload.payload && typeof payload.payload === 'object' ? payload.payload : undefined;

  let configKey = key;

  if (key in payload && typeof payload[key] === 'string') {
    configKey = payload[key];
  } else if (nested && key in nested && typeof nested[key] === 'string') {
    configKey = nested[key];
  }

  // Return config entry if present
  return (config as any)[configKey] ?? (config as any)[key];
}

/* -------------------------
   Chart container component
   ------------------------- */

function ChartContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('w-full', className)}>{children}</div>;
}

/* -------------------------
   Tooltip: content component
   ------------------------- */

/**
 * ChartTooltipContent
 *
 * We accept a relaxed prop shape so payload, label and formatter are available.
 * This component can be passed to Recharts' Tooltip via `content={ChartTooltipContent}`
 */
const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    active?: boolean;
    payload?: any[]; // Recharts' payload is dynamic
    label?: any;
    labelFormatter?: ((label: any, payload?: any[]) => React.ReactNode) | undefined;
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    formatter?: ((value: any, name?: string, entry?: any, index?: number, payload?: any) => React.ReactNode) | undefined;
    color?: string;
    labelClassName?: string;
    nameKey?: string;
    labelKey?: string;
  }
>(function ChartTooltipContent(
  {
    active,
    payload,
    className,
    indicator = 'dot',
    hideLabel = false,
    hideIndicator = false,
    label,
    labelFormatter,
    labelClassName,
    formatter,
    color,
    nameKey,
    labelKey,
  },
  ref
) {
  // NOTE: your application likely provides a `useChart()` hook and config;
  // If you have such a hook, replace the next line with `const { config } = useChart()`.
  // For this drop-in we assume a default empty config so code stays self-contained.
  const config = EMPTY_CONFIG;

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !Array.isArray(payload) || payload.length === 0) return null;
    const item = payload[0] ?? {};
    const key = labelKey ?? (item?.dataKey ?? item?.name ?? 'value');
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === 'string' ? (itemConfig?.label ?? label) : itemConfig?.label;
    if (!value) return null;
    if (labelFormatter) {
      return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>;
    }
    return <div className={cn('font-medium', labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, labelKey, config]);

  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const nestLabel = payload.length === 1 && indicator !== 'dot';

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className='grid gap-1.5'>
        {payload.map((item: any, index: number) => {
          const key = `${nameKey ?? item?.name ?? item?.dataKey ?? 'value'}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = color ?? (item?.payload?.fill) ?? item?.color;

          return (
            <div
              key={item?.dataKey ?? index}
              className={cn(
                'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
                indicator === 'dot' && 'items-center'
              )}
            >
              {formatter && item?.value !== undefined && item?.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          'shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]',
                          {
                            'h-2.5 w-2.5': indicator === 'dot',
                            'w-1': indicator === 'line',
                            'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                            'my-0.5': nestLabel && indicator === 'dashed',
                          }
                        )}
                        style={
                          {
                            // inline CSS vars so tailwind + inline style cooperate
                            ['--color-bg' as any]: indicatorColor,
                            ['--color-border' as any]: indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      'flex flex-1 justify-between leading-none',
                      nestLabel ? 'items-end' : 'items-center'
                    )}
                  >
                    <div className='grid gap-1.5'>
                      {nestLabel ? tooltipLabel : null}
                      <span className='text-muted-foreground'>{itemConfig?.label || item?.name}</span>
                    </div>
                    {item?.value !== undefined && item?.value !== null && (
                      <span className='font-mono font-medium tabular-nums text-foreground'>
                        {Number(item.value).toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = 'ChartTooltip';

/* -------------------------
   Tooltip wrapper
   ------------------------- */

function ChartTooltip(props: {
  // props mirror Recharts Tooltip props we commonly use
  formatter?: any;
  contentClassName?: string;
  labelClassName?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: 'line' | 'dot' | 'dashed';
}) {
  const { formatter, contentClassName, labelClassName, hideLabel, hideIndicator, indicator } = props;
  // We pass a renderer function to Recharts' Tooltip via `content`
  return (
    <RechartsTooltip
      content={({ active, payload, label }: any) => (
        <ChartTooltipContent
          active={active}
          payload={payload}
          label={label}
          formatter={formatter}
          className={contentClassName}
          labelClassName={labelClassName}
          hideLabel={hideLabel}
          hideIndicator={hideIndicator}
          indicator={indicator}
        />
      )}
    />
  );
}

/* -------------------------
   Legend: content component
   ------------------------- */

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    payload?: any[];
    hideIcon?: boolean;
    verticalAlign?: 'top' | 'bottom' | string;
    nameKey?: string;
  }
>(function ChartLegendContent({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) {
  // NOTE: replace/use your app's chart config hook if present
  const config = EMPTY_CONFIG;

  if (!Array.isArray(payload) || payload.length === 0) return null;

  return (
    <div
      ref={ref}
      className={cn('flex items-center justify-center gap-4', verticalAlign === 'top' ? 'pb-3' : 'pt-3', className)}
    >
      {payload.map((item: any) => {
        const key = (nameKey ?? item?.dataKey ?? `legend-${item?.value ?? Math.random()}`).toString();
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div
            key={item?.value ?? item?.dataKey ?? key}
            className={cn('flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground')}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div className='h-2 w-2 shrink-0 rounded-[2px]' style={{ backgroundColor: item?.color }} />
            )}
            <span>{itemConfig?.label}</span>
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = 'ChartLegend';

/* -------------------------
   Legend wrapper
   ------------------------- */

function ChartLegend(props: { payload?: any[]; hideIcon?: boolean; verticalAlign?: 'top' | 'bottom' | string; nameKey?: string }) {
  const { payload, hideIcon, verticalAlign, nameKey } = props;
  return <RechartsLegend content={<ChartLegendContent payload={payload} hideIcon={hideIcon} verticalAlign={verticalAlign} nameKey={nameKey} />} />;
}

/* -------------------------
   ChartStyle (optional)
   ------------------------- */

function ChartStyle() {
  // minimal style hook — you can extend with CSS vars/themes if required
  return (
    <style jsx global>{`
      /* Example minimal chart related styles; keep small */
      .recharts-wrapper {
        width: 100% !important;
      }
    `}</style>
  );
}

/* -------------------------
   Exports
   ------------------------- */

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
