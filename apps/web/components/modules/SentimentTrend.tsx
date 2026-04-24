"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Point = {
  date: string;
  morale: number;
  energy: number;
  candor: number;
  urgency: number;
};

type ChartPoint = Point & { dateLabel: string };

export function SentimentTrend() {
  const [data, setData] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Point[]>("/dashboard/home/sentiment-trend?days=90");
        if (!cancelled) {
          setData(
            res.map((p) => ({
              ...p,
              dateLabel: format(new Date(p.date), "MMM d"),
            }))
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-900">Sentiment trend</h3>
        <span className="text-xs text-ink-500">Last 90 days · 1–5 scale</span>
      </div>
      <div className="mt-4 h-56">
        {loading ? (
          <div className="text-sm text-ink-300">Loading…</div>
        ) : error ? (
          <div className="text-sm text-ink-300">Could not load sentiment.</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-ink-500">
            No sentiment data yet — runs a few interviews and trends appear here.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#EEF0F3" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="#8A96A3"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E2E6EB" }}
                minTickGap={24}
              />
              <YAxis
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                stroke="#8A96A3"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#E2E6EB" }}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #E2E6EB",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#0B0D10", fontWeight: 600 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#44505C" }}
                iconType="plainline"
              />
              <Line
                type="monotone"
                dataKey="morale"
                stroke="#2F5BEA"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#2F8F4E"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="candor"
                stroke="#D98613"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="urgency"
                stroke="#8A96A3"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
