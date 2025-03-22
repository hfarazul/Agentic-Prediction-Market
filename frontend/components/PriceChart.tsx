"use client";

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';

interface PriceChartProps {
  // Current probability (0-100)
  currentProbability: number;
  // The outcome to track ('yes' or 'no')
  outcome: 'yes' | 'no';
}

type TimeRange = '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

// Generate mock historical data
const generateHistoricalData = (currentValue: number, timeRange: TimeRange) => {
  // Number of data points based on time range
  const dataPoints = {
    '1H': 60,
    '6H': 72,
    '1D': 96,
    '1W': 84,
    '1M': 90,
    'ALL': 120
  }[timeRange];

  // Volatility based on time range (longer = more movement)
  const volatility = {
    '1H': 2,
    '6H': 3,
    '1D': 5,
    '1W': 10,
    '1M': 15,
    'ALL': 20
  }[timeRange];

  // Generate data working backwards from current value
  const result = [];
  let lastValue = currentValue;

  const now = new Date();

  for (let i = 0; i < dataPoints; i++) {
    // Random walk with mean reversion towards 50
    const meanReversionForce = (50 - lastValue) * 0.01;
    const randomComponent = (Math.random() - 0.5) * volatility;

    // Ensure values stay in range with higher probability of trending toward current value
    let change = meanReversionForce + randomComponent;

    // Make changes smaller as we get closer to current time
    const recentnessEffect = i / dataPoints;
    change *= recentnessEffect;

    // Calculate new value
    const newValue = Math.max(1, Math.min(99, lastValue - change));

    // Calculate timestamp
    const timestamp = new Date(now);
    switch (timeRange) {
      case '1H': timestamp.setMinutes(now.getMinutes() - (dataPoints - i)); break;
      case '6H': timestamp.setMinutes(now.getMinutes() - (dataPoints - i) * 6); break;
      case '1D': timestamp.setMinutes(now.getMinutes() - (dataPoints - i) * 15); break;
      case '1W': timestamp.setHours(now.getHours() - (dataPoints - i) * 2); break;
      case '1M': timestamp.setDate(now.getDate() - (dataPoints - i) / 3); break;
      case 'ALL': timestamp.setDate(now.getDate() - (dataPoints - i) * 2); break;
    }

    result.push({
      timestamp: timestamp.getTime(),
      value: newValue,
      formattedTime: formatTime(timestamp, timeRange)
    });

    lastValue = newValue;
  }

  // Add the current point
  result.push({
    timestamp: now.getTime(),
    value: currentValue,
    formattedTime: 'Now'
  });

  return result;
};

// Format timestamp based on time range
const formatTime = (date: Date, timeRange: TimeRange): string => {
  if (timeRange === '1H' || timeRange === '6H') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (timeRange === '1D') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (timeRange === '1W') {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

export default function PriceChart({ currentProbability, outcome }: PriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    // Generate mock historical data
    setData(generateHistoricalData(currentProbability, timeRange));
  }, [currentProbability, timeRange]);

  // Line color based on outcome
  const lineColor = outcome === 'yes' ? '#10B981' : '#EF4444';

  return (
    <div className="w-full">
      <div className="h-48 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine y={50} stroke="#666" strokeDasharray="3 3" />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              width={30}
              tickFormatter={(value) => `${value}%`}
            />
            <XAxis
              dataKey="formattedTime"
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-start space-x-4 mt-2">
        {(['1H', '6H', '1D', '1W', '1M', 'ALL'] as TimeRange[]).map((range) => (
          <button
            key={range}
            className={`px-2 py-1 text-xs font-medium rounded-md ${
              timeRange === range
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setTimeRange(range)}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
