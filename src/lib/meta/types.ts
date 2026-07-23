export type MetaGraphQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type MetaGraphQuery = Readonly<
  Record<string, MetaGraphQueryValue | readonly (string | number)[]>
>;

export interface MetaGraphPaging {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
  previous?: string;
}

export interface MetaGraphPage<T> {
  data: T[];
  paging?: MetaGraphPaging;
}

export interface MetaGraphErrorPayload {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export interface MetaGraphErrorResponse {
  error: MetaGraphErrorPayload;
}

export interface MetaAccessTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface MetaAccessToken {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number | null;
}

export interface MetaAction {
  action_type: string;
  value?: string | number;
  [attributionWindow: string]: string | number | undefined;
}

export interface MetaInsightRow {
  date_start?: string;
  date_stop?: string;
  account_id?: string;
  account_currency?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  creative_id?: string;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  frequency?: string | number;
  inline_link_clicks?: string | number;
  inline_link_click_ctr?: string | number;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_3_sec_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  [field: string]: unknown;
}

export interface MetaBusiness {
  id: string;
  name: string;
  verification_status?: string;
}

export interface MetaAdAccount {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: {
    id: string;
    name?: string;
  };
}

export interface MetaPage {
  id: string;
  name: string;
  category?: string;
}

export interface MetaApp {
  id: string;
  name: string;
  namespace?: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  account_id?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  optimization_goal?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: {
    id: string;
  };
}

export interface MetaCreative {
  id: string;
  name?: string;
  object_type?: string;
  image_hash?: string;
  image_url?: string;
  thumbnail_url?: string;
  video_id?: string;
  object_story_spec?: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
}
