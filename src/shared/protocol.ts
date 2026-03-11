export const DEFAULT_ACCENT_COLOR = "#4285f4";
export const DEFAULT_FALLBACK_STROKE_COLOR = "#1b1b1f";

export const TOOL_ORDER = ["pen", "rect", "circle", "text", "eraser", "pan"] as const;

export type Tool = (typeof TOOL_ORDER)[number];
export type ShapeType = Exclude<Tool, "eraser" | "pan">;
export type Point = [number, number];

export const TOOL_LABELS: Record<Tool, string> = {
  pen: "Pen",
  rect: "Rectangle",
  circle: "Circle",
  text: "Text",
  eraser: "Eraser",
  pan: "Pan",
};

export interface CursorSnapshot {
  username: string;
  color: string;
  x: number | null;
  y: number | null;
  down: boolean;
}

export interface CursorPayload extends CursorSnapshot {
  id: string;
}

export interface PenShapeData {
  points: Point[];
}

export interface RectShapeData {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleShapeData {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface TextShapeData {
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type ShapeData = PenShapeData | RectShapeData | CircleShapeData | TextShapeData;

export interface BaseShape<TType extends ShapeType, TData extends ShapeData> {
  id: string;
  userId: string;
  username: string;
  color: string;
  type: TType;
  data: TData;
  timestamp: number;
}

export type PenShape = BaseShape<"pen", PenShapeData>;
export type RectShape = BaseShape<"rect", RectShapeData>;
export type CircleShape = BaseShape<"circle", CircleShapeData>;
export type TextShape = BaseShape<"text", TextShapeData>;
export type Shape = PenShape | RectShape | CircleShape | TextShape;

export interface UndoEntry {
  type: "add" | "delete";
  shape: Shape;
}

export type PresencePayload =
  | { type: "join"; id: string; username: string; color: string }
  | { type: "leave"; id: string };

export interface DrawPayload {
  id: string;
  username: string;
  color: string;
  points: Point[];
}

export interface DrawRequest {
  points: Point[];
}

export interface JoinPayload {
  username: string;
  color: string;
}

export interface ShapeAddRequest {
  id?: string;
  type: ShapeType;
  data: ShapeData;
  color?: string;
}

export interface ShapeDeletePayload {
  id: string;
}

export interface StatePayload {
  cursors: CursorPayload[];
  shapes: Shape[];
}

export interface ErrorMessagePayload {
  message: string;
}

export interface ServerToClientEvents {
  presence: (payload: PresencePayload) => void;
  cursor: (payload: CursorPayload) => void;
  draw: (payload: DrawPayload) => void;
  drawEnd: (payload: { id: string }) => void;
  state: (payload: StatePayload) => void;
  shapeAdd: (payload: Shape) => void;
  shapeDelete: (payload: ShapeDeletePayload) => void;
  removeUserShapes: (payload: { id: string }) => void;
  errorMessage: (payload: ErrorMessagePayload) => void;
}

export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  cursor: (payload: Pick<CursorSnapshot, "x" | "y" | "down">) => void;
  draw: (payload: DrawRequest) => void;
  drawEnd: () => void;
  shapeAdd: (payload: ShapeAddRequest) => void;
  shapeDelete: (payload: ShapeDeletePayload) => void;
  updateColor: (payload: { color: string }) => void;
  requestState: () => void;
}

export interface InterServerEvents {}

export interface SocketSessionData {
  username?: string;
  color?: string;
}
