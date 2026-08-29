import { useMemo } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Experience, Pattern } from "./types";

interface CosmosViewProps {
  patterns: Pattern[];
  experiences: Experience[];
  selectedPatternId: string | null;
  onSelectPattern: (patternId: string) => void;
}

interface CosmosNode extends SimulationNodeDatum {
  id: string;
  kind: "pattern" | "experience";
  patternId?: string;
  contradiction?: boolean;
  label?: string;
}

interface CosmosLink extends SimulationLinkDatum<CosmosNode> {
  contradiction: boolean;
  patternId: string;
}

const WIDTH = 980;
const HEIGHT = 690;

function shortLabel(name: string): string {
  const words = name.split(" ");
  return words.length > 5 ? `${words.slice(0, 5).join(" ")}...` : name;
}

export function CosmosView({
  patterns,
  experiences,
  selectedPatternId,
  onSelectPattern,
}: CosmosViewProps) {
  const layout = useMemo(() => {
    const nodeById = new Map<string, CosmosNode>();
    const experienceOwner = new Map<string, { patternId: string; contradiction: boolean }>();

    patterns.forEach((pattern, index) => {
      const angle = (index / Math.max(patterns.length, 1)) * Math.PI * 2 - Math.PI / 2;
      nodeById.set(pattern.pattern_id, {
        id: pattern.pattern_id,
        kind: "pattern",
        patternId: pattern.pattern_id,
        label: pattern.name,
        x: WIDTH / 2 + Math.cos(angle) * 250,
        y: HEIGHT / 2 + Math.sin(angle) * 180,
      });
      pattern.supporting_experience_ids.forEach((id) => {
        if (!experienceOwner.has(id)) experienceOwner.set(id, { patternId: pattern.pattern_id, contradiction: false });
      });
      pattern.contradicting_experience_ids.forEach((id) => {
        if (!experienceOwner.has(id)) experienceOwner.set(id, { patternId: pattern.pattern_id, contradiction: true });
      });
    });

    experiences.forEach((experience, index) => {
      const owner = experienceOwner.get(experience.experience_id);
      const angle = ((index * 137.5) * Math.PI) / 180;
      nodeById.set(experience.experience_id, {
        id: experience.experience_id,
        kind: "experience",
        patternId: owner?.patternId,
        contradiction: owner?.contradiction,
        x: WIDTH / 2 + Math.cos(angle) * (160 + (index % 5) * 35),
        y: HEIGHT / 2 + Math.sin(angle) * (130 + (index % 4) * 28),
      });
    });

    const links: CosmosLink[] = [];
    patterns.forEach((pattern) => {
      pattern.supporting_experience_ids.forEach((id) => links.push({
        source: pattern.pattern_id,
        target: id,
        contradiction: false,
        patternId: pattern.pattern_id,
      }));
      pattern.contradicting_experience_ids.forEach((id) => links.push({
        source: pattern.pattern_id,
        target: id,
        contradiction: true,
        patternId: pattern.pattern_id,
      }));
    });

    const nodes = Array.from(nodeById.values());
    const simulation = forceSimulation(nodes)
      .force("link", forceLink<CosmosNode, CosmosLink>(links).id((node) => node.id).distance(72).strength(0.72))
      .force("charge", forceManyBody().strength((node) => (node as CosmosNode).kind === "pattern" ? -420 : -58))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("x", forceX(WIDTH / 2).strength(0.022))
      .force("y", forceY(HEIGHT / 2).strength(0.035))
      .force("collide", forceCollide<CosmosNode>().radius((node) => node.kind === "pattern" ? 58 : 13).iterations(2))
      .stop();
    for (let index = 0; index < 260; index += 1) simulation.tick();

    return { nodes, links };
  }, [patterns, experiences]);

  const patternsById = new Map(patterns.map((pattern) => [pattern.pattern_id, pattern]));

  return (
    <div className="cosmos-frame" aria-label="Pattern Cosmos visualization">
      <svg className="cosmos-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
        <defs>
          <filter id="nebula-blur"><feGaussianBlur stdDeviation="18" /></filter>
          <filter id="soft-blur"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>

        <g aria-hidden="true">
          {patterns.map((pattern) => {
            const node = layout.nodes.find((item) => item.id === pattern.pattern_id);
            if (!node) return null;
            const radius = 76 + Math.min(pattern.evidence_count, 6) * 8;
            return (
              <circle
                key={`field-${pattern.pattern_id}`}
                className={`pattern-field pattern-field--${pattern.visual_state}`}
                cx={node.x}
                cy={node.y}
                r={radius}
                filter="url(#nebula-blur)"
              />
            );
          })}
        </g>

        <g className="cosmos-links">
          {layout.links.map((link, index) => {
            const source = link.source as CosmosNode;
            const target = link.target as CosmosNode;
            const selected = selectedPatternId === link.patternId;
            return (
              <line
                key={`${link.patternId}-${target.id}-${index}`}
                className={`cosmos-link${link.contradiction ? " cosmos-link--contradiction" : ""}${selected ? " is-selected" : ""}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
              />
            );
          })}
        </g>

        <g className="experience-stars">
          {layout.nodes.filter((node) => node.kind === "experience").map((node) => (
            <circle
              key={node.id}
              className={`experience-star${node.contradiction ? " experience-star--contradiction" : ""}${!node.patternId ? " experience-star--unlinked" : ""}`}
              cx={node.x}
              cy={node.y}
              r={node.patternId ? 4.2 : 2.4}
            >
              <title>{node.id}</title>
            </circle>
          ))}
        </g>

        <g className="pattern-nodes">
          {layout.nodes.filter((node) => node.kind === "pattern").map((node) => {
            const pattern = patternsById.get(node.id)!;
            const selected = selectedPatternId === node.id;
            const radius = 18 + Math.min(pattern.evidence_count, 6) * 2.4;
            return (
              <g
                key={node.id}
                className={`pattern-node pattern-node--${pattern.visual_state}${selected ? " is-selected" : ""}`}
                onClick={() => onSelectPattern(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectPattern(node.id);
                }}
                aria-label={`Open pattern ${pattern.name}`}
              >
                <circle className="pattern-orbit" cx={node.x} cy={node.y} r={radius + 9} />
                <circle className="pattern-core" cx={node.x} cy={node.y} r={radius} />
                <text className="pattern-count" x={node.x} y={(node.y ?? 0) + 4} textAnchor="middle">
                  {pattern.evidence_count}
                </text>
                <text className="pattern-label" x={node.x} y={(node.y ?? 0) + radius + 22} textAnchor="middle">
                  {shortLabel(pattern.name)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="cosmos-legend" aria-label="Cosmos legend">
        <span><i className="legend-mark legend-mark--star" /> Experience</span>
        <span><i className="legend-mark legend-mark--pattern" /> Pattern</span>
        <span><i className="legend-mark legend-mark--contradiction" /> Contradiction</span>
      </div>
    </div>
  );
}
