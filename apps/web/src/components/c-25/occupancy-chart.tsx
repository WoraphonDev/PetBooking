"use client";

import type { ReportsOccupancyResponse } from "@app/contracts/endpoints/reports.occupancy";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatThaiDate } from "../../lib/format";
import { EmptyState } from "../shared/table";

// Percent is already rounded by reports.occupancy (Q-0031); never recompute it from room counts.
export function OccupancyChart({ days, label }: { days: ReportsOccupancyResponse["days"]; label: string }) {
  if (!days.length) return <EmptyState />;
  const data = days.map((day) => ({ ...day, label: formatThaiDate({ date: day.date }) }));
  const percent = (value: number) => `${value}%`;
  return (
    <figure aria-label={label}>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="h-72 w-full min-w-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} tickFormatter={percent} />
            <Tooltip formatter={(value) => (typeof value === "number" ? percent(value) : "")} />
            <Line dataKey="percent" name={label} stroke="var(--primary)" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.label}</th>
              <td>{percent(day.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
