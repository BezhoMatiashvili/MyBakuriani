#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const baseUrl = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const locale = process.env.PERF_LOCALE ?? "ka";
const sampleCount = Number.parseInt(process.env.PERF_SAMPLES ?? "3", 10);

const routes = [
  "/",
  "/apartments",
  "/hotels",
  `/${locale}/dashboard/renter`,
  `/${locale}/dashboard/admin`,
];

async function measureRoute(path) {
  const samples = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "cache-control": "no-cache" },
    });
    const body = await response.text();
    const totalMs = performance.now() - startedAt;

    samples.push({
      status: response.status,
      totalMs,
      bytes: Buffer.byteLength(body),
      url: response.url,
    });
  }

  const successSamples = samples.filter((sample) => sample.status < 400);
  const reference = successSamples[0] ?? samples[0];

  return {
    path,
    status: reference.status,
    finalUrl: reference.url,
    avgMs:
      samples.reduce((sum, sample) => sum + sample.totalMs, 0) / samples.length,
    minMs: Math.min(...samples.map((sample) => sample.totalMs)),
    maxMs: Math.max(...samples.map((sample) => sample.totalMs)),
    avgBytes:
      samples.reduce((sum, sample) => sum + sample.bytes, 0) / samples.length,
  };
}

async function main() {
  console.log(
    `Measuring ${routes.length} routes on ${baseUrl} with ${sampleCount} samples each...`,
  );

  const results = [];
  for (const route of routes) {
    results.push(await measureRoute(route));
  }

  console.table(
    results.map((result) => ({
      route: result.path,
      status: result.status,
      avg_ms: Math.round(result.avgMs),
      min_ms: Math.round(result.minMs),
      max_ms: Math.round(result.maxMs),
      avg_kb: Math.round(result.avgBytes / 1024),
      final_url: result.finalUrl,
    })),
  );
}

main().catch((error) => {
  console.error("Performance measurement failed:", error);
  process.exitCode = 1;
});
