import styles from "./admin-charts.module.css";

export type AdminChartListDatum = {
  key: string;
  label: string;
  value: number;
  percentage?: number;
};

export type AdminLineChartDatum = {
  key: string;
  label: string;
  value: number;
};

export type AdminChartModel =
  | {
      kind: "line";
      data: AdminLineChartDatum[];
      emptyLabel?: string;
    }
  | {
      kind: "bars";
      data: AdminChartListDatum[];
      emptyLabel?: string;
      maxItems?: number;
    };

export function AdminChartCard({
  title,
  subtitle,
  chart,
}: {
  title: string;
  subtitle?: string;
  chart: AdminChartModel;
}) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
      </header>
      <AdminChartRenderer chart={chart} />
    </section>
  );
}

export function AdminChartRenderer({ chart }: { chart: AdminChartModel }) {
  if (chart.kind === "line") {
    return <LineChart data={chart.data} emptyLabel={chart.emptyLabel} />;
  }

  return <BarListChart data={chart.data} emptyLabel={chart.emptyLabel} maxItems={chart.maxItems} />;
}

function LineChart({
  data,
  emptyLabel = "No trend data for the selected range.",
}: {
  data: AdminLineChartDatum[];
  emptyLabel?: string;
}) {
  const values = data.map((item) => item.value);
  const maxValue = Math.max(0, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);

  if (data.length === 0) {
    return <p className={styles.stateText}>{emptyLabel}</p>;
  }

  const viewWidth = 320;
  const viewHeight = 140;
  const leftPad = 16;
  const rightPad = 8;
  const topPad = 10;
  const bottomPad = 16;
  const innerWidth = viewWidth - leftPad - rightPad;
  const innerHeight = viewHeight - topPad - bottomPad;
  const denominator = Math.max(data.length - 1, 1);

  const points = data.map((item, index) => {
    const x = leftPad + (index / denominator) * innerWidth;
    const y =
      maxValue <= 0
        ? topPad + innerHeight
        : topPad + innerHeight - (item.value / maxValue) * innerHeight;
    return { x, y, value: item.value, label: item.label };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${leftPad} ${topPad + innerHeight}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${leftPad + innerWidth} ${topPad + innerHeight}`,
    "Z",
  ].join(" ");

  const tickIndexes = Array.from(new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.lineMeta}>
        <span>{total.toLocaleString()} tickets</span>
        <span>Peak: {maxValue.toLocaleString()}</span>
      </div>

      <svg
        className={styles.lineChart}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label="Ticket volume over time"
        preserveAspectRatio="none"
      >
        <line
          x1={leftPad}
          y1={topPad + innerHeight}
          x2={leftPad + innerWidth}
          y2={topPad + innerHeight}
          className={styles.axisLine}
        />
        <path d={areaPath} className={styles.lineArea} />
        <polyline points={polyline} className={styles.lineStroke} />
        {points.map((point, index) => (
          <circle key={data[index].key} cx={point.x} cy={point.y} r={2.5} className={styles.linePoint} />
        ))}
      </svg>

      <div className={styles.lineTicks}>
        {tickIndexes.map((index) => (
          <span key={`${data[index].key}-tick`}>{data[index].label}</span>
        ))}
      </div>

      {total === 0 ? <p className={styles.stateText}>{emptyLabel}</p> : null}
    </div>
  );
}

function BarListChart({
  data,
  emptyLabel = "No breakdown data for the selected range.",
  maxItems,
}: {
  data: AdminChartListDatum[];
  emptyLabel?: string;
  maxItems?: number;
}) {
  const visible = typeof maxItems === "number" && maxItems > 0 ? data.slice(0, maxItems) : data;
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(0, ...visible.map((item) => item.value));

  if (visible.length === 0) {
    return <p className={styles.stateText}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.barListWrap}>
      {total === 0 ? <p className={styles.stateText}>{emptyLabel}</p> : null}
      <ul className={styles.barList}>
        {visible.map((item) => {
          const widthPercent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

          return (
            <li key={item.key} className={styles.barItem}>
              <div className={styles.barRowTop}>
                <span className={styles.barLabel}>{item.label}</span>
                <span className={styles.barValue}>
                  {item.value.toLocaleString()}
                  {typeof item.percentage === "number" ? (
                    <span className={styles.barPercent}> ({item.percentage.toFixed(1)}%)</span>
                  ) : null}
                </span>
              </div>
              <div className={styles.barTrack} aria-hidden>
                <div className={styles.barFill} style={{ width: `${widthPercent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
