export type MessageType = 'text' | 'image' | 'location' | 'system';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  booking_id: number;
  sender_id: number;
  type: MessageType;
  content: string;
  content_hash?: string;
  status: MessageStatus;
  flagged: boolean;
  client_uuid: string;
  created_at: string;
}

export interface SendMessagePayload {
  client_uuid: string;
  type: MessageType;
  content: string;
}

