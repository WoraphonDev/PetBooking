"use client";

import {
  Bar,
  CartesianGrid,
  Line,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTHB, formatWeight } from "@/lib/format";
import { EmptyState } from "../table/index.ts";

export type ChartUnit = "number" | "money" | "weight";
export type ChartDatum = { label: string; value: number };
export type ChartProps = { label: string; data: ChartDatum[]; unit?: ChartUnit };

/** Values stay in their server units; formatting is display only. */
export function formatChartValue(value: number, unit: ChartUnit): string {
  if (!Number.isFinite(value)) throw new RangeError("chart value must be finite");
  if (unit === "money") return formatTHB({ satang: value });
  if (unit === "weight") return formatWeight({ grams: value });
  return String(value);
}

function ReportChart({ label, data, unit = "number", kind }: ChartProps & { kind: "bar" | "line" }) {
  const formatted = data.map((point) => formatChartValue(point.value, unit));
  if (data.length === 0) return <EmptyState />;
  const Chart = kind === "bar" ? RechartsBarChart : RechartsLineChart;
  return (
    <figure aria-label={label}>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="h-72 w-full min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <Chart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={unit === "number"} width={100} tickFormatter={(value: number) => formatChartValue(value, unit)} />
            <Tooltip formatter={(value) => (typeof value === "number" ? formatChartValue(value, unit) : "")} />
            {kind === "bar" ? (
              <Bar dataKey="value" name={label} fill="var(--primary)" isAnimationActive={false} />
            ) : (
              <Line dataKey="value" name={label} stroke="var(--primary)" isAnimationActive={false} />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((point, index) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{formatted[index]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarChart(props: ChartProps) {
  return <ReportChart {...props} kind="bar" />;
}

export function LineChart(props: ChartProps) {
  return <ReportChart {...props} kind="line" />;
}
