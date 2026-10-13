export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  role?: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  user?: User;
}

export interface WorkspaceDetail extends Workspace {
  members: WorkspaceMember[];
}

export interface Card {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  assignee?: User | null;
  rank: string;
  version: number;
  updated_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  title: string;
  rank: string;
  created_at: string;
  cards: Card[];
}

export interface Board {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  columns: Column[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface WebSocketMessage {
  type:
    | 'CONNECTED'
    | 'PONG'
    | 'CARD_CREATED'
    | 'CARD_UPDATED'
    | 'CARD_MOVED'
    | 'CARD_DELETED'
    | 'COLUMN_CREATED'
    | 'COLUMN_UPDATED'
    | 'COLUMN_DELETED'
    | 'COLUMN_REBALANCED';
  payload: any;
}
