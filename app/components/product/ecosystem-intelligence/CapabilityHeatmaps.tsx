import { readableKey, readinessLabel, taxonomyLabel } from "./labels";
import styles from "./ecosystem-intelligence.module.css";
import type { EcosystemFiltersDto, EcosystemSnapshotDto, MatrixCellDto } from "./types";

type MatrixDefinition = {
  title: string;
  accessibleName: string;
  rows: readonly string[];
  columns: readonly string[];
  cells: readonly MatrixCellDto[];
  rowLabel: (key: string) => string;
  columnLabel: (key: string) => string;
  filterFor: (rowKey: string, columnKey: string) => Partial<EcosystemFiltersDto>;
  emptyExplanation: string;
};

type CapabilityHeatmapsProps = {
  matrices: EcosystemSnapshotDto["matrices"];
  onFilter: (changes: Partial<EcosystemFiltersDto>) => void;
};

function MatrixTable({ definition, onFilter }: {
  definition: MatrixDefinition;
  onFilter: CapabilityHeatmapsProps["onFilter"];
}) {
  const cellByKey = new Map(
    definition.cells.map((cell) => [`${cell.rowKey}:${cell.columnKey}`, cell]),
  );
  const isEmpty = definition.rows.length === 0 || definition.columns.length === 0;

  return (
    <article className={styles.matrixPanel}>
      <div className={styles.matrixHeading}>
        <h3>{definition.title}</h3>
        <p>Counts describe the filtered map; evidence shows interpretation readiness.</p>
      </div>
      {isEmpty ? (
        <p className={styles.matrixEmpty}>
          {definition.emptyExplanation}
        </p>
      ) : (
        <div
          className={styles.matrixRail}
          role="region"
          aria-label={definition.accessibleName}
          data-horizontal-rail="true"
          tabIndex={0}
        >
          <table className={styles.matrixTable}>
            <caption className={styles.srOnly}>{definition.accessibleName}</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                {definition.columns.map((columnKey) => (
                  <th scope="col" key={columnKey}>{definition.columnLabel(columnKey)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {definition.rows.map((rowKey) => (
                <tr key={rowKey}>
                  <th scope="row">{definition.rowLabel(rowKey)}</th>
                  {definition.columns.map((columnKey) => {
                    const cell = cellByKey.get(`${rowKey}:${columnKey}`) ?? {
                      rowKey,
                      columnKey,
                      count: 0,
                      evidence: { numerator: 0, denominator: 0, percentage: 0 },
                      readiness: "empty" as const,
                    };
                    const rowLabel = definition.rowLabel(rowKey);
                    const columnLabel = definition.columnLabel(columnKey);
                    const evidenceText = `${cell.evidence.numerator} of ${cell.evidence.denominator} strong evidence`;
                    const label = `${rowLabel} and ${columnLabel}: ${cell.count} organisations, ${evidenceText}, ${cell.readiness.replaceAll("_", " ")}`;
                    return (
                      <td key={columnKey} data-intensity={Math.min(4, cell.count)}>
                        <button
                          type="button"
                          aria-label={label}
                          onClick={() => onFilter(definition.filterFor(rowKey, columnKey))}
                        >
                          <strong>{cell.count}</strong>
                          <span>{cell.evidence.numerator}/{cell.evidence.denominator} strong evidence</span>
                          <span>{readinessLabel(cell.readiness)}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function CapabilityHeatmaps({ matrices, onFilter }: CapabilityHeatmapsProps) {
  const definitions: MatrixDefinition[] = [
    {
      title: "Role by capability",
      accessibleName: "Role by capability matrix",
      rows: matrices.roleByCapability.rowKeys,
      columns: matrices.roleByCapability.columnKeys,
      cells: matrices.roleByCapability.cells,
      rowLabel: (key) => taxonomyLabel("ecosystem_role", key),
      columnLabel: (key) => taxonomyLabel("capability", key),
      filterFor: (rowKey, columnKey) => ({
        ecosystemRoles: [rowKey],
        capabilities: [columnKey],
      }),
      emptyExplanation: "This matrix needs resolved ecosystem roles and capabilities for the current filters.",
    },
    {
      title: "State by role",
      accessibleName: "State by role matrix",
      rows: matrices.stateByRole.rowKeys,
      columns: matrices.stateByRole.columnKeys,
      cells: matrices.stateByRole.cells,
      rowLabel: readableKey,
      columnLabel: (key) => taxonomyLabel("ecosystem_role", key),
      filterFor: (rowKey, columnKey) => ({
        headquartersStates: [rowKey],
        ecosystemRoles: [columnKey],
      }),
      emptyExplanation: "This matrix needs resolved headquarters states and ecosystem roles for the current filters.",
    },
  ];

  return (
    <section className={styles.analysisSection} aria-labelledby="capability-matrices-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Current capabilities</p>
          <h2 id="capability-matrices-heading">What the mapped ecosystem can currently do</h2>
        </div>
        <p>{matrices.denominator} filtered organisations form the matrix denominator.</p>
      </div>
      <div className={styles.matrixStack}>
        {definitions.map((definition) => (
          <MatrixTable key={definition.accessibleName} definition={definition} onFilter={onFilter} />
        ))}
      </div>
    </section>
  );
}
