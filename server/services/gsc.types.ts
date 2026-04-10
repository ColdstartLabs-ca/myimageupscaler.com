export interface IGscOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface IGscSearchAnalyticsRow {
  keys: string[];
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface IGscSearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
  startRow?: number;
  type?: string;
  dataState?: string;
  aggregationType?: string;
  dimensionFilterGroups?: Array<{
    filters: Array<{
      dimension: string;
      operator: string;
      expression: string;
    }>;
  }>;
}

export interface IGscSearchAnalyticsResponse {
  rows?: IGscSearchAnalyticsRow[];
  responseAggregationType?: string;
}

export interface IGscDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}
