# Context: context_src_types.md

## File: src\types\call.ts
```typescript
   1 | import type { AudioDspState } from '../audio/AudioPipeline';
   2 | 
   3 | export interface CallSession {
   4 |   id: string;
   5 |   tenantId: string;
   6 |   callControlId: string;
   7 |   correlationId: string;
   8 |   status: CallStatus;
   9 |   createdAt: Date;
  10 |   lastActivity: Date;
  11 |   metadata: Record<string, any>;
  12 |   dspState?: AudioDspState;
  13 | }
  14 | 
  15 | export enum CallStatus {
  16 |   INITIALIZING = 'initializing',
  17 |   CONNECTED = 'connected',
  18 |   AI_SPEAKING = 'ai_speaking',
  19 |   USER_SPEAKING = 'user_speaking',
  20 |   TOOL_CALLING = 'tool_calling',
  21 |   TERMINATING = 'terminating',
  22 |   TERMINATED = 'terminated'
  23 | }
  24 | 
  25 | export interface CallEventData {
  26 |   sessionId: string;
  27 |   tenantId: string;
  28 |   timestamp: Date;
  29 |   data?: any;
  30 | }
```

## File: src\types\index.ts
```typescript
   1 | export * from './schema';
   2 | export * from './call';
```

## File: src\types\schema.ts
```typescript
   1 | export type Json =
   2 |   | string
   3 |   | number
   4 |   | boolean
   5 |   | null
   6 |   | { [key: string]: Json | undefined }
   7 |   | Json[]
   8 | 
   9 | export type Database = {
  10 |   // Allows to automatically instantiate createClient with right options
  11 |   // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  12 |   __InternalSupabase: {
  13 |     PostgrestVersion: "14.4"
  14 |   }
  15 |   public: {
  16 |     Tables: {
  17 |       ai_enhancement_suggestions: {
  18 |         Row: {
  19 |           created_at: string | null
  20 |           description: string
  21 |           id: string
  22 |           related_call_ids: string[] | null
  23 |           status: Database["public"]["Enums"]["suggestion_status_type"] | null
  24 |           suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
  25 |           tenant_id: string
  26 |           updated_at: string | null
  27 |         }
  28 |         Insert: {
  29 |           created_at?: string | null
  30 |           description: string
  31 |           id?: string
  32 |           related_call_ids?: string[] | null
  33 |           status?: Database["public"]["Enums"]["suggestion_status_type"] | null
  34 |           suggestion_type: Database["public"]["Enums"]["suggestion_type_enum"]
  35 |           tenant_id: string
  36 |           updated_at?: string | null
  37 |         }
  38 |         Update: {
  39 |           created_at?: string | null
  40 |           description?: string
  41 |           id?: string
  42 |           related_call_ids?: string[] | null
  43 |           status?: Database["public"]["Enums"]["suggestion_status_type"] | null
  44 |           suggestion_type?: Database["public"]["Enums"]["suggestion_type_enum"]
  45 |           tenant_id?: string
  46 |           updated_at?: string | null
  47 |         }
  48 |         Relationships: [
  49 |           {
  50 |             foreignKeyName: "ai_enhancement_suggestions_tenant_id_fkey"
  51 |             columns: ["tenant_id"]
  52 |             isOneToOne: false
  53 |             referencedRelation: "tenants"
  54 |             referencedColumns: ["id"]
  55 |           },
  56 |         ]
  57 |       }
  58 |       appointments: {
  59 |         Row: {
  60 |           created_at: string | null
  61 |           customer_id: string
  62 |           customer_name: string | null
  63 |           customer_phone: string | null
  64 |           date: string | null
  65 |           duration_minutes: number | null
  66 |           employee_id: string
  67 |           end_time: string
  68 |           id: string
  69 |           notes: string | null
  70 |           service_id: string
  71 |           service_name: string | null
  72 |           session_id: string | null
  73 |           source: Database["public"]["Enums"]["appointment_source_type"] | null
  74 |           start_time: string
  75 |           status: Database["public"]["Enums"]["appointment_status_type"] | null
  76 |           tenant_id: string
  77 |           time: string | null
  78 |           updated_at: string | null
  79 |         }
  80 |         Insert: {
  81 |           created_at?: string | null
  82 |           customer_id: string
  83 |           customer_name?: string | null
  84 |           customer_phone?: string | null
  85 |           date?: string | null
  86 |           duration_minutes?: number | null
  87 |           employee_id: string
  88 |           end_time: string
  89 |           id?: string
  90 |           notes?: string | null
  91 |           service_id: string
  92 |           service_name?: string | null
  93 |           session_id?: string | null
  94 |           source?: Database["public"]["Enums"]["appointment_source_type"] | null
  95 |           start_time: string
  96 |           status?: Database["public"]["Enums"]["appointment_status_type"] | null
  97 |           tenant_id: string
  98 |           time?: string | null
  99 |           updated_at?: string | null
 100 |         }
 101 |         Update: {
 102 |           created_at?: string | null
 103 |           customer_id?: string
 104 |           customer_name?: string | null
 105 |           customer_phone?: string | null
 106 |           date?: string | null
 107 |           duration_minutes?: number | null
 108 |           employee_id?: string
 109 |           end_time?: string
 110 |           id?: string
 111 |           notes?: string | null
 112 |           service_id?: string
 113 |           service_name?: string | null
 114 |           session_id?: string | null
 115 |           source?: Database["public"]["Enums"]["appointment_source_type"] | null
 116 |           start_time?: string
 117 |           status?: Database["public"]["Enums"]["appointment_status_type"] | null
 118 |           tenant_id?: string
 119 |           time?: string | null
 120 |           updated_at?: string | null
 121 |         }
 122 |         Relationships: [
 123 |           {
 124 |             foreignKeyName: "appointments_customer_id_fkey"
 125 |             columns: ["customer_id"]
 126 |             isOneToOne: false
 127 |             referencedRelation: "customers"
 128 |             referencedColumns: ["id"]
 129 |           },
 130 |           {
 131 |             foreignKeyName: "appointments_employee_id_fkey"
 132 |             columns: ["employee_id"]
 133 |             isOneToOne: false
 134 |             referencedRelation: "employees"
 135 |             referencedColumns: ["id"]
 136 |           },
 137 |           {
 138 |             foreignKeyName: "appointments_service_id_fkey"
 139 |             columns: ["service_id"]
 140 |             isOneToOne: false
 141 |             referencedRelation: "services"
 142 |             referencedColumns: ["id"]
 143 |           },
 144 |           {
 145 |             foreignKeyName: "appointments_tenant_id_fkey"
 146 |             columns: ["tenant_id"]
 147 |             isOneToOne: false
 148 |             referencedRelation: "tenants"
 149 |             referencedColumns: ["id"]
 150 |           },
 151 |         ]
 152 |       }
 153 |       business_hours: {
 154 |         Row: {
 155 |           created_at: string | null
 156 |           day_of_week: number
 157 |           end_time: string
 158 |           id: string
 159 |           is_closed: boolean | null
 160 |           start_time: string
 161 |           tenant_id: string
 162 |           updated_at: string | null
 163 |         }
 164 |         Insert: {
 165 |           created_at?: string | null
 166 |           day_of_week: number
 167 |           end_time: string
 168 |           id?: string
 169 |           is_closed?: boolean | null
 170 |           start_time: string
 171 |           tenant_id: string
 172 |           updated_at?: string | null
 173 |         }
 174 |         Update: {
 175 |           created_at?: string | null
 176 |           day_of_week?: number
 177 |           end_time?: string
 178 |           id?: string
 179 |           is_closed?: boolean | null
 180 |           start_time?: string
 181 |           tenant_id?: string
 182 |           updated_at?: string | null
 183 |         }
 184 |         Relationships: [
 185 |           {
 186 |             foreignKeyName: "business_hours_tenant_id_fkey"
 187 |             columns: ["tenant_id"]
 188 |             isOneToOne: false
 189 |             referencedRelation: "tenants"
 190 |             referencedColumns: ["id"]
 191 |           },
 192 |         ]
 193 |       }
 194 |       business_hours_exceptions: {
 195 |         Row: {
 196 |           created_at: string | null
 197 |           date: string
 198 |           end_time: string | null
 199 |           id: string
 200 |           is_closed: boolean
 201 |           note: string | null
 202 |           start_time: string | null
 203 |           tenant_id: string
 204 |           updated_at: string | null
 205 |         }
 206 |         Insert: {
 207 |           created_at?: string | null
 208 |           date: string
 209 |           end_time?: string | null
 210 |           id?: string
 211 |           is_closed?: boolean
 212 |           note?: string | null
 213 |           start_time?: string | null
 214 |           tenant_id: string
 215 |           updated_at?: string | null
 216 |         }
 217 |         Update: {
 218 |           created_at?: string | null
 219 |           date?: string
 220 |           end_time?: string | null
 221 |           id?: string
 222 |           is_closed?: boolean
 223 |           note?: string | null
 224 |           start_time?: string | null
 225 |           tenant_id?: string
 226 |           updated_at?: string | null
 227 |         }
 228 |         Relationships: []
 229 |       }
 230 |       call_logs: {
 231 |         Row: {
 232 |           created_at: string | null
 233 |           customer_id: string | null
 234 |           duration_seconds: number | null
 235 |           end_time: string | null
 236 |           id: string
 237 |           start_time: string
 238 |           status: Database["public"]["Enums"]["call_status_type"] | null
 239 |           tenant_id: string
 240 |         }
 241 |         Insert: {
 242 |           created_at?: string | null
 243 |           customer_id?: string | null
 244 |           duration_seconds?: number | null
 245 |           end_time?: string | null
 246 |           id?: string
 247 |           start_time: string
 248 |           status?: Database["public"]["Enums"]["call_status_type"] | null
 249 |           tenant_id: string
 250 |         }
 251 |         Update: {
 252 |           created_at?: string | null
 253 |           customer_id?: string | null
 254 |           duration_seconds?: number | null
 255 |           end_time?: string | null
 256 |           id?: string
 257 |           start_time?: string
 258 |           status?: Database["public"]["Enums"]["call_status_type"] | null
 259 |           tenant_id?: string
 260 |         }
 261 |         Relationships: [
 262 |           {
 263 |             foreignKeyName: "call_logs_customer_id_fkey"
 264 |             columns: ["customer_id"]
 265 |             isOneToOne: false
 266 |             referencedRelation: "customers"
 267 |             referencedColumns: ["id"]
 268 |           },
 269 |           {
 270 |             foreignKeyName: "call_logs_tenant_id_fkey"
 271 |             columns: ["tenant_id"]
 272 |             isOneToOne: false
 273 |             referencedRelation: "tenants"
 274 |             referencedColumns: ["id"]
 275 |           },
 276 |         ]
 277 |       }
 278 |       call_review_sessions: {
 279 |         Row: {
 280 |           created_at: string
 281 |           duration_seconds: number | null
 282 |           id: string
 283 |           outcome: string | null
 284 |           review_status: string | null
 285 |           session_id: string
 286 |           tenant_id: string
 287 |           transcript: string | null
 288 |         }
 289 |         Insert: {
 290 |           created_at?: string
 291 |           duration_seconds?: number | null
 292 |           id?: string
 293 |           outcome?: string | null
 294 |           review_status?: string | null
 295 |           session_id: string
 296 |           tenant_id: string
 297 |           transcript?: string | null
 298 |         }
 299 |         Update: {
 300 |           created_at?: string
 301 |           duration_seconds?: number | null
 302 |           id?: string
 303 |           outcome?: string | null
 304 |           review_status?: string | null
 305 |           session_id?: string
 306 |           tenant_id?: string
 307 |           transcript?: string | null
 308 |         }
 309 |         Relationships: [
 310 |           {
 311 |             foreignKeyName: "call_review_sessions_tenant_id_fkey"
 312 |             columns: ["tenant_id"]
 313 |             isOneToOne: false
 314 |             referencedRelation: "tenants"
 315 |             referencedColumns: ["id"]
 316 |           },
 317 |         ]
 318 |       }
 319 |       call_traces: {
 320 |         Row: {
 321 |           call_log_id: string | null
 322 |           content: Json
 323 |           correlation_id: string | null
 324 |           created_at: string | null
 325 |           id: string
 326 |           step_type: Database["public"]["Enums"]["step_type_enum"]
 327 |           tenant_id: string
 328 |           timestamp: string | null
 329 |         }
 330 |         Insert: {
 331 |           call_log_id?: string | null
 332 |           content: Json
 333 |           correlation_id?: string | null
 334 |           created_at?: string | null
 335 |           id?: string
 336 |           step_type: Database["public"]["Enums"]["step_type_enum"]
 337 |           tenant_id: string
 338 |           timestamp?: string | null
 339 |         }
 340 |         Update: {
 341 |           call_log_id?: string | null
 342 |           content?: Json
 343 |           correlation_id?: string | null
 344 |           created_at?: string | null
 345 |           id?: string
 346 |           step_type?: Database["public"]["Enums"]["step_type_enum"]
 347 |           tenant_id?: string
 348 |           timestamp?: string | null
 349 |         }
 350 |         Relationships: [
 351 |           {
 352 |             foreignKeyName: "call_traces_call_log_id_fkey"
 353 |             columns: ["call_log_id"]
 354 |             isOneToOne: false
 355 |             referencedRelation: "call_logs"
 356 |             referencedColumns: ["id"]
 357 |           },
 358 |           {
 359 |             foreignKeyName: "call_traces_tenant_id_fkey"
 360 |             columns: ["tenant_id"]
 361 |             isOneToOne: false
 362 |             referencedRelation: "tenants"
 363 |             referencedColumns: ["id"]
 364 |           },
 365 |         ]
 366 |       }
 367 |       call_transcripts: {
 368 |         Row: {
 369 |           call_control_id: string | null
 370 |           created_at: string | null
 371 |           ended_at: string | null
 372 |           id: string
 373 |           session_id: string | null
 374 |           speaker: string | null
 375 |           started_at: string | null
 376 |           tenant_id: string | null
 377 |           text: string
 378 |           token_count: number | null
 379 |           turn_index: number | null
 380 |         }
 381 |         Insert: {
 382 |           call_control_id?: string | null
 383 |           created_at?: string | null
 384 |           ended_at?: string | null
 385 |           id?: string
 386 |           session_id?: string | null
 387 |           speaker?: string | null
 388 |           started_at?: string | null
 389 |           tenant_id?: string | null
 390 |           text: string
 391 |           token_count?: number | null
 392 |           turn_index?: number | null
 393 |         }
 394 |         Update: {
 395 |           call_control_id?: string | null
 396 |           created_at?: string | null
 397 |           ended_at?: string | null
 398 |           id?: string
 399 |           session_id?: string | null
 400 |           speaker?: string | null
 401 |           started_at?: string | null
 402 |           tenant_id?: string | null
 403 |           text?: string
 404 |           token_count?: number | null
 405 |           turn_index?: number | null
 406 |         }
 407 |         Relationships: [
 408 |           {
 409 |             foreignKeyName: "call_transcripts_tenant_id_fkey"
 410 |             columns: ["tenant_id"]
 411 |             isOneToOne: false
 412 |             referencedRelation: "tenants"
 413 |             referencedColumns: ["id"]
 414 |           },
 415 |         ]
 416 |       }
 417 |       conversation_feedback: {
 418 |         Row: {
 419 |           ai_message: string
 420 |           category: string | null
 421 |           context: Json | null
 422 |           created_at: string
 423 |           feedback_comment: string | null
 424 |           feedback_type: string
 425 |           id: string
 426 |           log_entry_id: string | null
 427 |           message_index: number
 428 |           reviewed_by: string | null
 429 |           session_id: string
 430 |           tenant_id: string
 431 |         }
 432 |         Insert: {
 433 |           ai_message: string
 434 |           category?: string | null
 435 |           context?: Json | null
 436 |           created_at?: string
 437 |           feedback_comment?: string | null
 438 |           feedback_type: string
 439 |           id?: string
 440 |           log_entry_id?: string | null
 441 |           message_index: number
 442 |           reviewed_by?: string | null
 443 |           session_id: string
 444 |           tenant_id: string
 445 |         }
 446 |         Update: {
 447 |           ai_message?: string
 448 |           category?: string | null
 449 |           context?: Json | null
 450 |           created_at?: string
 451 |           feedback_comment?: string | null
 452 |           feedback_type?: string
 453 |           id?: string
 454 |           log_entry_id?: string | null
 455 |           message_index?: number
 456 |           reviewed_by?: string | null
 457 |           session_id?: string
 458 |           tenant_id?: string
 459 |         }
 460 |         Relationships: [
 461 |           {
 462 |             foreignKeyName: "conversation_feedback_tenant_id_fkey"
 463 |             columns: ["tenant_id"]
 464 |             isOneToOne: false
 465 |             referencedRelation: "tenants"
 466 |             referencedColumns: ["id"]
 467 |           },
 468 |         ]
 469 |       }
 470 |       conversation_logs: {
 471 |         Row: {
 472 |           created_at: string
 473 |           id: string
 474 |           message: string
 475 |           message_index: number
 476 |           metadata: Json | null
 477 |           role: string
 478 |           session_id: string
 479 |           tenant_id: string | null
 480 |           timestamp: string | null
 481 |           tool_input: Json | null
 482 |           tool_name: string | null
 483 |           tool_output: Json | null
 484 |         }
 485 |         Insert: {
 486 |           created_at?: string
 487 |           id?: string
 488 |           message: string
 489 |           message_index?: number
 490 |           metadata?: Json | null
 491 |           role: string
 492 |           session_id: string
 493 |           tenant_id?: string | null
 494 |           timestamp?: string | null
 495 |           tool_input?: Json | null
 496 |           tool_name?: string | null
 497 |           tool_output?: Json | null
 498 |         }
 499 |         Update: {
 500 |           created_at?: string
 501 |           id?: string
 502 |           message?: string
 503 |           message_index?: number
 504 |           metadata?: Json | null
 505 |           role?: string
 506 |           session_id?: string
 507 |           tenant_id?: string | null
 508 |           timestamp?: string | null
 509 |           tool_input?: Json | null
 510 |           tool_name?: string | null
 511 |           tool_output?: Json | null
 512 |         }
 513 |         Relationships: [
 514 |           {
 515 |             foreignKeyName: "conversation_logs_tenant_id_fkey"
 516 |             columns: ["tenant_id"]
 517 |             isOneToOne: false
 518 |             referencedRelation: "tenants"
 519 |             referencedColumns: ["id"]
 520 |           },
 521 |         ]
 522 |       }
 523 |       conversation_sessions: {
 524 |         Row: {
 525 |           channel: string
 526 |           context: Json
 527 |           created_at: string | null
 528 |           customer_id: string | null
 529 |           customer_name: string | null
 530 |           customer_phone: string | null
 531 |           duration_seconds: number | null
 532 |           ended_at: string | null
 533 |           id: string
 534 |           last_activity_at: string
 535 |           metadata: Json | null
 536 |           metrics: Json | null
 537 |           outcome: string | null
 538 |           phase: string
 539 |           session_id: string
 540 |           started_at: string
 541 |           state: Json | null
 542 |           status: string | null
 543 |           tenant_id: string
 544 |           total_cost_eur: number | null
 545 |           total_tokens: number | null
 546 |           transcript_summary: string | null
 547 |           updated_at: string | null
 548 |         }
 549 |         Insert: {
 550 |           channel?: string
 551 |           context?: Json
 552 |           created_at?: string | null
 553 |           customer_id?: string | null
 554 |           customer_name?: string | null
 555 |           customer_phone?: string | null
 556 |           duration_seconds?: number | null
 557 |           ended_at?: string | null
 558 |           id?: string
 559 |           last_activity_at?: string
 560 |           metadata?: Json | null
 561 |           metrics?: Json | null
 562 |           outcome?: string | null
 563 |           phase?: string
 564 |           session_id: string
 565 |           started_at?: string
 566 |           state?: Json | null
 567 |           status?: string | null
 568 |           tenant_id: string
 569 |           total_cost_eur?: number | null
 570 |           total_tokens?: number | null
 571 |           transcript_summary?: string | null
 572 |           updated_at?: string | null
 573 |         }
 574 |         Update: {
 575 |           channel?: string
 576 |           context?: Json
 577 |           created_at?: string | null
 578 |           customer_id?: string | null
 579 |           customer_name?: string | null
 580 |           customer_phone?: string | null
 581 |           duration_seconds?: number | null
 582 |           ended_at?: string | null
 583 |           id?: string
 584 |           last_activity_at?: string
 585 |           metadata?: Json | null
 586 |           metrics?: Json | null
 587 |           outcome?: string | null
 588 |           phase?: string
 589 |           session_id?: string
 590 |           started_at?: string
 591 |           state?: Json | null
 592 |           status?: string | null
 593 |           tenant_id?: string
 594 |           total_cost_eur?: number | null
 595 |           total_tokens?: number | null
 596 |           transcript_summary?: string | null
 597 |           updated_at?: string | null
 598 |         }
 599 |         Relationships: [
 600 |           {
 601 |             foreignKeyName: "conversation_sessions_customer_id_fkey"
 602 |             columns: ["customer_id"]
 603 |             isOneToOne: false
 604 |             referencedRelation: "customers"
 605 |             referencedColumns: ["id"]
 606 |           },
 607 |           {
 608 |             foreignKeyName: "conversation_sessions_tenant_id_fkey"
 609 |             columns: ["tenant_id"]
 610 |             isOneToOne: false
 611 |             referencedRelation: "tenants"
 612 |             referencedColumns: ["id"]
 613 |           },
 614 |         ]
 615 |       }
 616 |       custom_prompts: {
 617 |         Row: {
 618 |           created_at: string | null
 619 |           id: string
 620 |           is_active: boolean | null
 621 |           name: string
 622 |           prompt_text: string
 623 |           tenant_id: string
 624 |           updated_at: string | null
 625 |         }
 626 |         Insert: {
 627 |           created_at?: string | null
 628 |           id?: string
 629 |           is_active?: boolean | null
 630 |           name: string
 631 |           prompt_text: string
 632 |           tenant_id: string
 633 |           updated_at?: string | null
 634 |         }
 635 |         Update: {
 636 |           created_at?: string | null
 637 |           id?: string
 638 |           is_active?: boolean | null
 639 |           name?: string
 640 |           prompt_text?: string
 641 |           tenant_id?: string
 642 |           updated_at?: string | null
 643 |         }
 644 |         Relationships: [
 645 |           {
 646 |             foreignKeyName: "custom_prompts_tenant_id_fkey"
 647 |             columns: ["tenant_id"]
 648 |             isOneToOne: false
 649 |             referencedRelation: "tenants"
 650 |             referencedColumns: ["id"]
 651 |           },
 652 |         ]
 653 |       }
 654 |       customer_history: {
 655 |         Row: {
 656 |           channel: string | null
 657 |           created_at: string
 658 |           customer_id: string
 659 |           customer_since: string | null
 660 |           first_visit: boolean | null
 661 |           id: string
 662 |           interaction_type: string | null
 663 |           last_employee_name: string | null
 664 |           last_service: string | null
 665 |           last_session_id: string | null
 666 |           last_visit: string | null
 667 |           notes: string | null
 668 |           phone_number: string | null
 669 |           preferred_service_ids: string[] | null
 670 |           tenant_id: string
 671 |           total_visits: number | null
 672 |           updated_at: string
 673 |           visit_date: string | null
 674 |         }
 675 |         Insert: {
 676 |           channel?: string | null
 677 |           created_at?: string
 678 |           customer_id: string
 679 |           customer_since?: string | null
 680 |           first_visit?: boolean | null
 681 |           id?: string
 682 |           interaction_type?: string | null
 683 |           last_employee_name?: string | null
 684 |           last_service?: string | null
 685 |           last_session_id?: string | null
 686 |           last_visit?: string | null
 687 |           notes?: string | null
 688 |           phone_number?: string | null
 689 |           preferred_service_ids?: string[] | null
 690 |           tenant_id: string
 691 |           total_visits?: number | null
 692 |           updated_at?: string
 693 |           visit_date?: string | null
 694 |         }
 695 |         Update: {
 696 |           channel?: string | null
 697 |           created_at?: string
 698 |           customer_id?: string
 699 |           customer_since?: string | null
 700 |           first_visit?: boolean | null
 701 |           id?: string
 702 |           interaction_type?: string | null
 703 |           last_employee_name?: string | null
 704 |           last_service?: string | null
 705 |           last_session_id?: string | null
 706 |           last_visit?: string | null
 707 |           notes?: string | null
 708 |           phone_number?: string | null
 709 |           preferred_service_ids?: string[] | null
 710 |           tenant_id?: string
 711 |           total_visits?: number | null
 712 |           updated_at?: string
 713 |           visit_date?: string | null
 714 |         }
 715 |         Relationships: [
 716 |           {
 717 |             foreignKeyName: "customer_history_customer_id_fkey"
 718 |             columns: ["customer_id"]
 719 |             isOneToOne: false
 720 |             referencedRelation: "customers"
 721 |             referencedColumns: ["id"]
 722 |           },
 723 |           {
 724 |             foreignKeyName: "customer_history_tenant_id_fkey"
 725 |             columns: ["tenant_id"]
 726 |             isOneToOne: false
 727 |             referencedRelation: "tenants"
 728 |             referencedColumns: ["id"]
 729 |           },
 730 |         ]
 731 |       }
 732 |       customers: {
 733 |         Row: {
 734 |           created_at: string | null
 735 |           email: string | null
 736 |           first_name: string | null
 737 |           id: string
 738 |           last_name: string | null
 739 |           last_visit_date: string | null
 740 |           notes: string | null
 741 |           phone: string
 742 |           phone_normalized: string | null
 743 |           preferences: Json | null
 744 |           preferred_employee_id: string | null
 745 |           preferred_service_ids: string[] | null
 746 |           tenant_id: string
 747 |           total_no_shows: number | null
 748 |           total_visits: number | null
 749 |           updated_at: string | null
 750 |         }
 751 |         Insert: {
 752 |           created_at?: string | null
 753 |           email?: string | null
 754 |           first_name?: string | null
 755 |           id?: string
 756 |           last_name?: string | null
 757 |           last_visit_date?: string | null
 758 |           notes?: string | null
 759 |           phone: string
 760 |           phone_normalized?: string | null
 761 |           preferences?: Json | null
 762 |           preferred_employee_id?: string | null
 763 |           preferred_service_ids?: string[] | null
 764 |           tenant_id: string
 765 |           total_no_shows?: number | null
 766 |           total_visits?: number | null
 767 |           updated_at?: string | null
 768 |         }
 769 |         Update: {
 770 |           created_at?: string | null
 771 |           email?: string | null
 772 |           first_name?: string | null
 773 |           id?: string
 774 |           last_name?: string | null
 775 |           last_visit_date?: string | null
 776 |           notes?: string | null
 777 |           phone?: string
 778 |           phone_normalized?: string | null
 779 |           preferences?: Json | null
 780 |           preferred_employee_id?: string | null
 781 |           preferred_service_ids?: string[] | null
 782 |           tenant_id?: string
 783 |           total_no_shows?: number | null
 784 |           total_visits?: number | null
 785 |           updated_at?: string | null
 786 |         }
 787 |         Relationships: [
 788 |           {
 789 |             foreignKeyName: "customers_tenant_id_fkey"
 790 |             columns: ["tenant_id"]
 791 |             isOneToOne: false
 792 |             referencedRelation: "tenants"
 793 |             referencedColumns: ["id"]
 794 |           },
 795 |         ]
 796 |       }
 797 |       dev_configs: {
 798 |         Row: {
 799 |           config: Json
 800 |           created_at: string | null
 801 |           custom_prompt: string | null
 802 |           id: string
 803 |           tenant_id: string
 804 |           updated_at: string | null
 805 |         }
 806 |         Insert: {
 807 |           config?: Json
 808 |           created_at?: string | null
 809 |           custom_prompt?: string | null
 810 |           id?: string
 811 |           tenant_id: string
 812 |           updated_at?: string | null
 813 |         }
 814 |         Update: {
 815 |           config?: Json
 816 |           created_at?: string | null
 817 |           custom_prompt?: string | null
 818 |           id?: string
 819 |           tenant_id?: string
 820 |           updated_at?: string | null
 821 |         }
 822 |         Relationships: [
 823 |           {
 824 |             foreignKeyName: "dev_configs_tenant_id_fkey"
 825 |             columns: ["tenant_id"]
 826 |             isOneToOne: true
 827 |             referencedRelation: "tenants"
 828 |             referencedColumns: ["id"]
 829 |           },
 830 |         ]
 831 |       }
 832 |       dev_presets: {
 833 |         Row: {
 834 |           config: Json
 835 |           created_at: string | null
 836 |           id: string
 837 |           name: string
 838 |           saved_at: number
 839 |           tenant_id: string
 840 |         }
 841 |         Insert: {
 842 |           config?: Json
 843 |           created_at?: string | null
 844 |           id?: string
 845 |           name: string
 846 |           saved_at: number
 847 |           tenant_id: string
 848 |         }
 849 |         Update: {
 850 |           config?: Json
 851 |           created_at?: string | null
 852 |           id?: string
 853 |           name?: string
 854 |           saved_at?: number
 855 |           tenant_id?: string
 856 |         }
 857 |         Relationships: [
 858 |           {
 859 |             foreignKeyName: "dev_presets_tenant_id_fkey"
 860 |             columns: ["tenant_id"]
 861 |             isOneToOne: false
 862 |             referencedRelation: "tenants"
 863 |             referencedColumns: ["id"]
 864 |           },
 865 |         ]
 866 |       }
 867 |       dev_session_tool_calls: {
 868 |         Row: {
 869 |           args: Json | null
 870 |           created_at: string | null
 871 |           duration_ms: number
 872 |           error: string | null
 873 |           id: string
 874 |           result: Json | null
 875 |           session_id: string
 876 |           success: boolean
 877 |           tenant_id: string
 878 |           timestamp: number
 879 |           tool_name: string
 880 |         }
 881 |         Insert: {
 882 |           args?: Json | null
 883 |           created_at?: string | null
 884 |           duration_ms?: number
 885 |           error?: string | null
 886 |           id?: string
 887 |           result?: Json | null
 888 |           session_id: string
 889 |           success?: boolean
 890 |           tenant_id: string
 891 |           timestamp: number
 892 |           tool_name: string
 893 |         }
 894 |         Update: {
 895 |           args?: Json | null
 896 |           created_at?: string | null
 897 |           duration_ms?: number
 898 |           error?: string | null
 899 |           id?: string
 900 |           result?: Json | null
 901 |           session_id?: string
 902 |           success?: boolean
 903 |           tenant_id?: string
 904 |           timestamp?: number
 905 |           tool_name?: string
 906 |         }
 907 |         Relationships: [
 908 |           {
 909 |             foreignKeyName: "dev_session_tool_calls_session_id_fkey"
 910 |             columns: ["session_id"]
 911 |             isOneToOne: false
 912 |             referencedRelation: "dev_sessions"
 913 |             referencedColumns: ["id"]
 914 |           },
 915 |           {
 916 |             foreignKeyName: "dev_session_tool_calls_tenant_id_fkey"
 917 |             columns: ["tenant_id"]
 918 |             isOneToOne: false
 919 |             referencedRelation: "tenants"
 920 |             referencedColumns: ["id"]
 921 |           },
 922 |         ]
 923 |       }
 924 |       dev_session_transcript: {
 925 |         Row: {
 926 |           created_at: string | null
 927 |           id: string
 928 |           latency_ms: number | null
 929 |           role: string
 930 |           session_id: string
 931 |           session_init_data: Json | null
 932 |           tenant_id: string
 933 |           text: string
 934 |           timestamp: number
 935 |           tool_args: Json | null
 936 |           tool_name: string | null
 937 |           tool_query: string | null
 938 |           tool_query_result: Json | null
 939 |           tool_result: Json | null
 940 |         }
 941 |         Insert: {
 942 |           created_at?: string | null
 943 |           id: string
 944 |           latency_ms?: number | null
 945 |           role: string
 946 |           session_id: string
 947 |           session_init_data?: Json | null
 948 |           tenant_id: string
 949 |           text?: string
 950 |           timestamp: number
 951 |           tool_args?: Json | null
 952 |           tool_name?: string | null
 953 |           tool_query?: string | null
 954 |           tool_query_result?: Json | null
 955 |           tool_result?: Json | null
 956 |         }
 957 |         Update: {
 958 |           created_at?: string | null
 959 |           id?: string
 960 |           latency_ms?: number | null
 961 |           role?: string
 962 |           session_id?: string
 963 |           session_init_data?: Json | null
 964 |           tenant_id?: string
 965 |           text?: string
 966 |           timestamp?: number
 967 |           tool_args?: Json | null
 968 |           tool_name?: string | null
 969 |           tool_query?: string | null
 970 |           tool_query_result?: Json | null
 971 |           tool_result?: Json | null
 972 |         }
 973 |         Relationships: [
 974 |           {
 975 |             foreignKeyName: "dev_session_transcript_session_id_fkey"
 976 |             columns: ["session_id"]
 977 |             isOneToOne: false
 978 |             referencedRelation: "dev_sessions"
 979 |             referencedColumns: ["id"]
 980 |           },
 981 |           {
 982 |             foreignKeyName: "dev_session_transcript_tenant_id_fkey"
 983 |             columns: ["tenant_id"]
 984 |             isOneToOne: false
 985 |             referencedRelation: "tenants"
 986 |             referencedColumns: ["id"]
 987 |           },
 988 |         ]
 989 |       }
 990 |       dev_sessions: {
 991 |         Row: {
 992 |           ai_speaking_history: Json | null
 993 |           config: Json
 994 |           created_at: string | null
 995 |           ended_at: number | null
 996 |           id: string
 997 |           session_init: Json | null
 998 |           started_at: number
 999 |           stats: Json
1000 |           tenant_id: string
1001 |           user_volume_history: Json | null
1002 |         }
1003 |         Insert: {
1004 |           ai_speaking_history?: Json | null
1005 |           config?: Json
1006 |           created_at?: string | null
1007 |           ended_at?: number | null
1008 |           id: string
1009 |           session_init?: Json | null
1010 |           started_at: number
1011 |           stats?: Json
1012 |           tenant_id: string
1013 |           user_volume_history?: Json | null
1014 |         }
1015 |         Update: {
1016 |           ai_speaking_history?: Json | null
1017 |           config?: Json
1018 |           created_at?: string | null
1019 |           ended_at?: number | null
1020 |           id?: string
1021 |           session_init?: Json | null
1022 |           started_at?: number
1023 |           stats?: Json
1024 |           tenant_id?: string
1025 |           user_volume_history?: Json | null
1026 |         }
1027 |         Relationships: [
1028 |           {
1029 |             foreignKeyName: "dev_sessions_tenant_id_fkey"
1030 |             columns: ["tenant_id"]
1031 |             isOneToOne: false
1032 |             referencedRelation: "tenants"
1033 |             referencedColumns: ["id"]
1034 |           },
1035 |         ]
1036 |       }
1037 |       employee_blocks: {
1038 |         Row: {
1039 |           created_at: string | null
1040 |           created_by_employee: boolean | null
1041 |           date: string
1042 |           employee_id: string
1043 |           end_time: string
1044 |           id: string
1045 |           is_recurring: boolean | null
1046 |           label: string | null
1047 |           recurrence_day_of_week: number | null
1048 |           start_time: string
1049 |           tenant_id: string
1050 |           type: string
1051 |         }
1052 |         Insert: {
1053 |           created_at?: string | null
1054 |           created_by_employee?: boolean | null
1055 |           date: string
1056 |           employee_id: string
1057 |           end_time: string
1058 |           id?: string
1059 |           is_recurring?: boolean | null
1060 |           label?: string | null
1061 |           recurrence_day_of_week?: number | null
1062 |           start_time: string
1063 |           tenant_id: string
1064 |           type?: string
1065 |         }
1066 |         Update: {
1067 |           created_at?: string | null
1068 |           created_by_employee?: boolean | null
1069 |           date?: string
1070 |           employee_id?: string
1071 |           end_time?: string
1072 |           id?: string
1073 |           is_recurring?: boolean | null
1074 |           label?: string | null
1075 |           recurrence_day_of_week?: number | null
1076 |           start_time?: string
1077 |           tenant_id?: string
1078 |           type?: string
1079 |         }
1080 |         Relationships: [
1081 |           {
1082 |             foreignKeyName: "employee_blocks_employee_id_fkey"
1083 |             columns: ["employee_id"]
1084 |             isOneToOne: false
1085 |             referencedRelation: "employees"
1086 |             referencedColumns: ["id"]
1087 |           },
1088 |           {
1089 |             foreignKeyName: "employee_blocks_tenant_id_fkey"
1090 |             columns: ["tenant_id"]
1091 |             isOneToOne: false
1092 |             referencedRelation: "tenants"
1093 |             referencedColumns: ["id"]
1094 |           },
1095 |         ]
1096 |       }
1097 |       employee_documents: {
1098 |         Row: {
1099 |           document_type: string
1100 |           employee_id: string
1101 |           expires_at: string | null
1102 |           file_name: string | null
1103 |           file_path: string | null
1104 |           file_size: number | null
1105 |           id: string
1106 |           mime_type: string | null
1107 |           notes: string | null
1108 |           tenant_id: string
1109 |           title: string | null
1110 |           uploaded_at: string | null
1111 |           uploaded_by: string | null
1112 |         }
1113 |         Insert: {
1114 |           document_type: string
1115 |           employee_id: string
1116 |           expires_at?: string | null
1117 |           file_name?: string | null
1118 |           file_path?: string | null
1119 |           file_size?: number | null
1120 |           id?: string
1121 |           mime_type?: string | null
1122 |           notes?: string | null
1123 |           tenant_id: string
1124 |           title?: string | null
1125 |           uploaded_at?: string | null
1126 |           uploaded_by?: string | null
1127 |         }
1128 |         Update: {
1129 |           document_type?: string
1130 |           employee_id?: string
1131 |           expires_at?: string | null
1132 |           file_name?: string | null
1133 |           file_path?: string | null
1134 |           file_size?: number | null
1135 |           id?: string
1136 |           mime_type?: string | null
1137 |           notes?: string | null
1138 |           tenant_id?: string
1139 |           title?: string | null
1140 |           uploaded_at?: string | null
1141 |           uploaded_by?: string | null
1142 |         }
1143 |         Relationships: [
1144 |           {
1145 |             foreignKeyName: "employee_documents_employee_id_fkey"
1146 |             columns: ["employee_id"]
1147 |             isOneToOne: false
1148 |             referencedRelation: "employees"
1149 |             referencedColumns: ["id"]
1150 |           },
1151 |           {
1152 |             foreignKeyName: "employee_documents_tenant_id_fkey"
1153 |             columns: ["tenant_id"]
1154 |             isOneToOne: false
1155 |             referencedRelation: "tenants"
1156 |             referencedColumns: ["id"]
1157 |           },
1158 |           {
1159 |             foreignKeyName: "employee_documents_uploaded_by_fkey"
1160 |             columns: ["uploaded_by"]
1161 |             isOneToOne: false
1162 |             referencedRelation: "users"
1163 |             referencedColumns: ["id"]
1164 |           },
1165 |         ]
1166 |       }
1167 |       employee_employment_history: {
1168 |         Row: {
1169 |           created_at: string | null
1170 |           created_by: string | null
1171 |           effective_date: string
1172 |           employee_id: string
1173 |           end_date: string | null
1174 |           event_type: string
1175 |           id: string
1176 |           new_value: string | null
1177 |           note: string | null
1178 |           previous_value: string | null
1179 |           tenant_id: string
1180 |         }
1181 |         Insert: {
1182 |           created_at?: string | null
1183 |           created_by?: string | null
1184 |           effective_date: string
1185 |           employee_id: string
1186 |           end_date?: string | null
1187 |           event_type: string
1188 |           id?: string
1189 |           new_value?: string | null
1190 |           note?: string | null
1191 |           previous_value?: string | null
1192 |           tenant_id: string
1193 |         }
1194 |         Update: {
1195 |           created_at?: string | null
1196 |           created_by?: string | null
1197 |           effective_date?: string
1198 |           employee_id?: string
1199 |           end_date?: string | null
1200 |           event_type?: string
1201 |           id?: string
1202 |           new_value?: string | null
1203 |           note?: string | null
1204 |           previous_value?: string | null
1205 |           tenant_id?: string
1206 |         }
1207 |         Relationships: [
1208 |           {
1209 |             foreignKeyName: "employee_employment_history_employee_id_fkey"
1210 |             columns: ["employee_id"]
1211 |             isOneToOne: false
1212 |             referencedRelation: "employees"
1213 |             referencedColumns: ["id"]
1214 |           },
1215 |           {
1216 |             foreignKeyName: "employee_employment_history_tenant_id_fkey"
1217 |             columns: ["tenant_id"]
1218 |             isOneToOne: false
1219 |             referencedRelation: "tenants"
1220 |             referencedColumns: ["id"]
1221 |           },
1222 |         ]
1223 |       }
1224 |       employee_feature_overrides: {
1225 |         Row: {
1226 |           created_at: string | null
1227 |           employee_id: string
1228 |           enabled: boolean
1229 |           feature_key: string
1230 |           id: string
1231 |           tenant_id: string
1232 |           updated_at: string | null
1233 |         }
1234 |         Insert: {
1235 |           created_at?: string | null
1236 |           employee_id: string
1237 |           enabled: boolean
1238 |           feature_key: string
1239 |           id?: string
1240 |           tenant_id: string
1241 |           updated_at?: string | null
1242 |         }
1243 |         Update: {
1244 |           created_at?: string | null
1245 |           employee_id?: string
1246 |           enabled?: boolean
1247 |           feature_key?: string
1248 |           id?: string
1249 |           tenant_id?: string
1250 |           updated_at?: string | null
1251 |         }
1252 |         Relationships: [
1253 |           {
1254 |             foreignKeyName: "employee_feature_overrides_employee_id_fkey"
1255 |             columns: ["employee_id"]
1256 |             isOneToOne: false
1257 |             referencedRelation: "employees"
1258 |             referencedColumns: ["id"]
1259 |           },
1260 |           {
1261 |             foreignKeyName: "employee_feature_overrides_tenant_id_fkey"
1262 |             columns: ["tenant_id"]
1263 |             isOneToOne: false
1264 |             referencedRelation: "tenants"
1265 |             referencedColumns: ["id"]
1266 |           },
1267 |         ]
1268 |       }
1269 |       employee_performance_reviews: {
1270 |         Row: {
1271 |           comments: string | null
1272 |           created_at: string | null
1273 |           employee_id: string
1274 |           goals: string | null
1275 |           id: string
1276 |           improvements: string | null
1277 |           rating_communication: number | null
1278 |           rating_leadership: number | null
1279 |           rating_overall: number | null
1280 |           rating_reliability: number | null
1281 |           rating_technical: number | null
1282 |           review_date: string
1283 |           review_period_end: string | null
1284 |           review_period_start: string | null
1285 |           review_type: string | null
1286 |           reviewed_by: string | null
1287 |           strengths: string | null
1288 |           tenant_id: string
1289 |           updated_at: string | null
1290 |         }
1291 |         Insert: {
1292 |           comments?: string | null
1293 |           created_at?: string | null
1294 |           employee_id: string
1295 |           goals?: string | null
1296 |           id?: string
1297 |           improvements?: string | null
1298 |           rating_communication?: number | null
1299 |           rating_leadership?: number | null
1300 |           rating_overall?: number | null
1301 |           rating_reliability?: number | null
1302 |           rating_technical?: number | null
1303 |           review_date: string
1304 |           review_period_end?: string | null
1305 |           review_period_start?: string | null
1306 |           review_type?: string | null
1307 |           reviewed_by?: string | null
1308 |           strengths?: string | null
1309 |           tenant_id: string
1310 |           updated_at?: string | null
1311 |         }
1312 |         Update: {
1313 |           comments?: string | null
1314 |           created_at?: string | null
1315 |           employee_id?: string
1316 |           goals?: string | null
1317 |           id?: string
1318 |           improvements?: string | null
1319 |           rating_communication?: number | null
1320 |           rating_leadership?: number | null
1321 |           rating_overall?: number | null
1322 |           rating_reliability?: number | null
1323 |           rating_technical?: number | null
1324 |           review_date?: string
1325 |           review_period_end?: string | null
1326 |           review_period_start?: string | null
1327 |           review_type?: string | null
1328 |           reviewed_by?: string | null
1329 |           strengths?: string | null
1330 |           tenant_id?: string
1331 |           updated_at?: string | null
1332 |         }
1333 |         Relationships: [
1334 |           {
1335 |             foreignKeyName: "employee_performance_reviews_employee_id_fkey"
1336 |             columns: ["employee_id"]
1337 |             isOneToOne: false
1338 |             referencedRelation: "employees"
1339 |             referencedColumns: ["id"]
1340 |           },
1341 |           {
1342 |             foreignKeyName: "employee_performance_reviews_reviewed_by_fkey"
1343 |             columns: ["reviewed_by"]
1344 |             isOneToOne: false
1345 |             referencedRelation: "users"
1346 |             referencedColumns: ["id"]
1347 |           },
1348 |           {
1349 |             foreignKeyName: "employee_performance_reviews_tenant_id_fkey"
1350 |             columns: ["tenant_id"]
1351 |             isOneToOne: false
1352 |             referencedRelation: "tenants"
1353 |             referencedColumns: ["id"]
1354 |           },
1355 |         ]
1356 |       }
1357 |       employee_services: {
1358 |         Row: {
1359 |           created_at: string | null
1360 |           employee_id: string
1361 |           id: string
1362 |           service_id: string
1363 |           tenant_id: string
1364 |         }
1365 |         Insert: {
1366 |           created_at?: string | null
1367 |           employee_id: string
1368 |           id?: string
1369 |           service_id: string
1370 |           tenant_id: string
1371 |         }
1372 |         Update: {
1373 |           created_at?: string | null
1374 |           employee_id?: string
1375 |           id?: string
1376 |           service_id?: string
1377 |           tenant_id?: string
1378 |         }
1379 |         Relationships: [
1380 |           {
1381 |             foreignKeyName: "employee_services_employee_id_fkey"
1382 |             columns: ["employee_id"]
1383 |             isOneToOne: false
1384 |             referencedRelation: "employees"
1385 |             referencedColumns: ["id"]
1386 |           },
1387 |           {
1388 |             foreignKeyName: "employee_services_service_id_fkey"
1389 |             columns: ["service_id"]
1390 |             isOneToOne: false
1391 |             referencedRelation: "services"
1392 |             referencedColumns: ["id"]
1393 |           },
1394 |           {
1395 |             foreignKeyName: "employee_services_tenant_id_fkey"
1396 |             columns: ["tenant_id"]
1397 |             isOneToOne: false
1398 |             referencedRelation: "tenants"
1399 |             referencedColumns: ["id"]
1400 |           },
1401 |         ]
1402 |       }
1403 |       employee_sick_leave: {
1404 |         Row: {
1405 |           created_at: string | null
1406 |           days_count: number
1407 |           doctor_note_provided: boolean | null
1408 |           employee_id: string
1409 |           end_date: string
1410 |           id: string
1411 |           is_emergency: boolean | null
1412 |           is_work_related: boolean | null
1413 |           note: string | null
1414 |           occupational_health_contacted: boolean | null
1415 |           reason: string | null
1416 |           sent_home_at: string | null
1417 |           start_date: string
1418 |           status: string | null
1419 |           tenant_id: string
1420 |           updated_at: string | null
1421 |           year: number
1422 |         }
1423 |         Insert: {
1424 |           created_at?: string | null
1425 |           days_count?: number
1426 |           doctor_note_provided?: boolean | null
1427 |           employee_id: string
1428 |           end_date: string
1429 |           id?: string
1430 |           is_emergency?: boolean | null
1431 |           is_work_related?: boolean | null
1432 |           note?: string | null
1433 |           occupational_health_contacted?: boolean | null
1434 |           reason?: string | null
1435 |           sent_home_at?: string | null
1436 |           start_date: string
1437 |           status?: string | null
1438 |           tenant_id: string
1439 |           updated_at?: string | null
1440 |           year?: number
1441 |         }
1442 |         Update: {
1443 |           created_at?: string | null
1444 |           days_count?: number
1445 |           doctor_note_provided?: boolean | null
1446 |           employee_id?: string
1447 |           end_date?: string
1448 |           id?: string
1449 |           is_emergency?: boolean | null
1450 |           is_work_related?: boolean | null
1451 |           note?: string | null
1452 |           occupational_health_contacted?: boolean | null
1453 |           reason?: string | null
1454 |           sent_home_at?: string | null
1455 |           start_date?: string
1456 |           status?: string | null
1457 |           tenant_id?: string
1458 |           updated_at?: string | null
1459 |           year?: number
1460 |         }
1461 |         Relationships: [
1462 |           {
1463 |             foreignKeyName: "employee_sick_leave_employee_id_fkey"
1464 |             columns: ["employee_id"]
1465 |             isOneToOne: false
1466 |             referencedRelation: "employees"
1467 |             referencedColumns: ["id"]
1468 |           },
1469 |           {
1470 |             foreignKeyName: "employee_sick_leave_tenant_id_fkey"
1471 |             columns: ["tenant_id"]
1472 |             isOneToOne: false
1473 |             referencedRelation: "tenants"
1474 |             referencedColumns: ["id"]
1475 |           },
1476 |         ]
1477 |       }
1478 |       employee_skills: {
1479 |         Row: {
1480 |           created_at: string | null
1481 |           employee_id: string
1482 |           expires_at: string | null
1483 |           id: string
1484 |           level: string | null
1485 |           obtained_at: string | null
1486 |           skill_category: string | null
1487 |           skill_name: string
1488 |           tenant_id: string
1489 |           verified: boolean | null
1490 |         }
1491 |         Insert: {
1492 |           created_at?: string | null
1493 |           employee_id: string
1494 |           expires_at?: string | null
1495 |           id?: string
1496 |           level?: string | null
1497 |           obtained_at?: string | null
1498 |           skill_category?: string | null
1499 |           skill_name: string
1500 |           tenant_id: string
1501 |           verified?: boolean | null
1502 |         }
1503 |         Update: {
1504 |           created_at?: string | null
1505 |           employee_id?: string
1506 |           expires_at?: string | null
1507 |           id?: string
1508 |           level?: string | null
1509 |           obtained_at?: string | null
1510 |           skill_category?: string | null
1511 |           skill_name?: string
1512 |           tenant_id?: string
1513 |           verified?: boolean | null
1514 |         }
1515 |         Relationships: [
1516 |           {
1517 |             foreignKeyName: "employee_skills_employee_id_fkey"
1518 |             columns: ["employee_id"]
1519 |             isOneToOne: false
1520 |             referencedRelation: "employees"
1521 |             referencedColumns: ["id"]
1522 |           },
1523 |           {
1524 |             foreignKeyName: "employee_skills_tenant_id_fkey"
1525 |             columns: ["tenant_id"]
1526 |             isOneToOne: false
1527 |             referencedRelation: "tenants"
1528 |             referencedColumns: ["id"]
1529 |           },
1530 |         ]
1531 |       }
1532 |       employee_time_logs: {
1533 |         Row: {
1534 |           break_minutes: number | null
1535 |           clock_in: string
1536 |           clock_out: string | null
1537 |           created_at: string | null
1538 |           date: string
1539 |           employee_id: string
1540 |           id: string
1541 |           note: string | null
1542 |           tenant_id: string
1543 |           total_minutes: number | null
1544 |           updated_at: string | null
1545 |         }
1546 |         Insert: {
1547 |           break_minutes?: number | null
1548 |           clock_in: string
1549 |           clock_out?: string | null
1550 |           created_at?: string | null
1551 |           date: string
1552 |           employee_id: string
1553 |           id?: string
1554 |           note?: string | null
1555 |           tenant_id: string
1556 |           total_minutes?: number | null
1557 |           updated_at?: string | null
1558 |         }
1559 |         Update: {
1560 |           break_minutes?: number | null
1561 |           clock_in?: string
1562 |           clock_out?: string | null
1563 |           created_at?: string | null
1564 |           date?: string
1565 |           employee_id?: string
1566 |           id?: string
1567 |           note?: string | null
1568 |           tenant_id?: string
1569 |           total_minutes?: number | null
1570 |           updated_at?: string | null
1571 |         }
1572 |         Relationships: [
1573 |           {
1574 |             foreignKeyName: "employee_time_logs_employee_id_fkey"
1575 |             columns: ["employee_id"]
1576 |             isOneToOne: false
1577 |             referencedRelation: "employees"
1578 |             referencedColumns: ["id"]
1579 |           },
1580 |           {
1581 |             foreignKeyName: "employee_time_logs_tenant_id_fkey"
1582 |             columns: ["tenant_id"]
1583 |             isOneToOne: false
1584 |             referencedRelation: "tenants"
1585 |             referencedColumns: ["id"]
1586 |           },
1587 |         ]
1588 |       }
1589 |       employee_vacation_bookings: {
1590 |         Row: {
1591 |           created_at: string | null
1592 |           days_count: number
1593 |           employee_id: string
1594 |           end_date: string
1595 |           id: string
1596 |           note: string | null
1597 |           start_date: string
1598 |           status: string | null
1599 |           tenant_id: string
1600 |           updated_at: string | null
1601 |           year: number
1602 |         }
1603 |         Insert: {
1604 |           created_at?: string | null
1605 |           days_count?: number
1606 |           employee_id: string
1607 |           end_date: string
1608 |           id?: string
1609 |           note?: string | null
1610 |           start_date: string
1611 |           status?: string | null
1612 |           tenant_id: string
1613 |           updated_at?: string | null
1614 |           year?: number
1615 |         }
1616 |         Update: {
1617 |           created_at?: string | null
1618 |           days_count?: number
1619 |           employee_id?: string
1620 |           end_date?: string
1621 |           id?: string
1622 |           note?: string | null
1623 |           start_date?: string
1624 |           status?: string | null
1625 |           tenant_id?: string
1626 |           updated_at?: string | null
1627 |           year?: number
1628 |         }
1629 |         Relationships: [
1630 |           {
1631 |             foreignKeyName: "employee_vacation_bookings_employee_id_fkey"
1632 |             columns: ["employee_id"]
1633 |             isOneToOne: false
1634 |             referencedRelation: "employees"
1635 |             referencedColumns: ["id"]
1636 |           },
1637 |           {
1638 |             foreignKeyName: "employee_vacation_bookings_tenant_id_fkey"
1639 |             columns: ["tenant_id"]
1640 |             isOneToOne: false
1641 |             referencedRelation: "tenants"
1642 |             referencedColumns: ["id"]
1643 |           },
1644 |         ]
1645 |       }
1646 |       employee_vacation_days: {
1647 |         Row: {
1648 |           created_at: string | null
1649 |           days_total: number
1650 |           days_used: number
1651 |           employee_id: string
1652 |           end_date: string | null
1653 |           id: string
1654 |           note: string | null
1655 |           start_date: string | null
1656 |           tenant_id: string
1657 |           updated_at: string | null
1658 |           year: number
1659 |         }
1660 |         Insert: {
1661 |           created_at?: string | null
1662 |           days_total?: number
1663 |           days_used?: number
1664 |           employee_id: string
1665 |           end_date?: string | null
1666 |           id?: string
1667 |           note?: string | null
1668 |           start_date?: string | null
1669 |           tenant_id: string
1670 |           updated_at?: string | null
1671 |           year?: number
1672 |         }
1673 |         Update: {
1674 |           created_at?: string | null
1675 |           days_total?: number
1676 |           days_used?: number
1677 |           employee_id?: string
1678 |           end_date?: string | null
1679 |           id?: string
1680 |           note?: string | null
1681 |           start_date?: string | null
1682 |           tenant_id?: string
1683 |           updated_at?: string | null
1684 |           year?: number
1685 |         }
1686 |         Relationships: [
1687 |           {
1688 |             foreignKeyName: "employee_vacation_days_employee_id_fkey"
1689 |             columns: ["employee_id"]
1690 |             isOneToOne: false
1691 |             referencedRelation: "employees"
1692 |             referencedColumns: ["id"]
1693 |           },
1694 |           {
1695 |             foreignKeyName: "employee_vacation_days_tenant_id_fkey"
1696 |             columns: ["tenant_id"]
1697 |             isOneToOne: false
1698 |             referencedRelation: "tenants"
1699 |             referencedColumns: ["id"]
1700 |           },
1701 |         ]
1702 |       }
1703 |       employee_working_hours: {
1704 |         Row: {
1705 |           created_at: string | null
1706 |           day_of_week: number
1707 |           employee_id: string
1708 |           end_time: string
1709 |           id: string
1710 |           start_time: string
1711 |           tenant_id: string
1712 |           updated_at: string | null
1713 |           week_start_date: string | null
1714 |         }
1715 |         Insert: {
1716 |           created_at?: string | null
1717 |           day_of_week: number
1718 |           employee_id: string
1719 |           end_time: string
1720 |           id?: string
1721 |           start_time: string
1722 |           tenant_id: string
1723 |           updated_at?: string | null
1724 |           week_start_date?: string | null
1725 |         }
1726 |         Update: {
1727 |           created_at?: string | null
1728 |           day_of_week?: number
1729 |           employee_id?: string
1730 |           end_time?: string
1731 |           id?: string
1732 |           start_time?: string
1733 |           tenant_id?: string
1734 |           updated_at?: string | null
1735 |           week_start_date?: string | null
1736 |         }
1737 |         Relationships: [
1738 |           {
1739 |             foreignKeyName: "employee_working_hours_employee_id_fkey"
1740 |             columns: ["employee_id"]
1741 |             isOneToOne: false
1742 |             referencedRelation: "employees"
1743 |             referencedColumns: ["id"]
1744 |           },
1745 |           {
1746 |             foreignKeyName: "employee_working_hours_tenant_id_fkey"
1747 |             columns: ["tenant_id"]
1748 |             isOneToOne: false
1749 |             referencedRelation: "tenants"
1750 |             referencedColumns: ["id"]
1751 |           },
1752 |         ]
1753 |       }
1754 |       employees: {
1755 |         Row: {
1756 |           address: string | null
1757 |           bank_account_iban: string | null
1758 |           bank_account_name: string | null
1759 |           city: string | null
1760 |           civil_status: string | null
1761 |           color: string | null
1762 |           contract_end_date: string | null
1763 |           contract_start_date: string | null
1764 |           contract_type: string | null
1765 |           created_at: string | null
1766 |           date_of_birth: string | null
1767 |           email: string | null
1768 |           emergency_contact_name: string | null
1769 |           emergency_contact_phone: string | null
1770 |           emergency_contact_relation: string | null
1771 |           employee_number: string | null
1772 |           has_company_car: boolean | null
1773 |           has_pension: boolean | null
1774 |           hourly_rate: number | null
1775 |           hours_per_week: number | null
1776 |           id: string
1777 |           is_active: boolean | null
1778 |           lease_amount: number | null
1779 |           monthly_salary: number | null
1780 |           name: string
1781 |           nationality: string | null
1782 |           notice_period_weeks: number | null
1783 |           payment_frequency: string | null
1784 |           pension_percentage: number | null
1785 |           phone: string | null
1786 |           postal_code: string | null
1787 |           probation_end_date: string | null
1788 |           role: Database["public"]["Enums"]["user_role_type"]
1789 |           tenant_id: string
1790 |           unlock_code: string | null
1791 |           updated_at: string | null
1792 |           user_id: string | null
1793 |         }
1794 |         Insert: {
1795 |           address?: string | null
1796 |           bank_account_iban?: string | null
1797 |           bank_account_name?: string | null
1798 |           city?: string | null
1799 |           civil_status?: string | null
1800 |           color?: string | null
1801 |           contract_end_date?: string | null
1802 |           contract_start_date?: string | null
1803 |           contract_type?: string | null
1804 |           created_at?: string | null
1805 |           date_of_birth?: string | null
1806 |           email?: string | null
1807 |           emergency_contact_name?: string | null
1808 |           emergency_contact_phone?: string | null
1809 |           emergency_contact_relation?: string | null
1810 |           employee_number?: string | null
1811 |           has_company_car?: boolean | null
1812 |           has_pension?: boolean | null
1813 |           hourly_rate?: number | null
1814 |           hours_per_week?: number | null
1815 |           id?: string
1816 |           is_active?: boolean | null
1817 |           lease_amount?: number | null
1818 |           monthly_salary?: number | null
1819 |           name: string
1820 |           nationality?: string | null
1821 |           notice_period_weeks?: number | null
1822 |           payment_frequency?: string | null
1823 |           pension_percentage?: number | null
1824 |           phone?: string | null
1825 |           postal_code?: string | null
1826 |           probation_end_date?: string | null
1827 |           role?: Database["public"]["Enums"]["user_role_type"]
1828 |           tenant_id: string
1829 |           unlock_code?: string | null
1830 |           updated_at?: string | null
1831 |           user_id?: string | null
1832 |         }
1833 |         Update: {
1834 |           address?: string | null
1835 |           bank_account_iban?: string | null
1836 |           bank_account_name?: string | null
1837 |           city?: string | null
1838 |           civil_status?: string | null
1839 |           color?: string | null
1840 |           contract_end_date?: string | null
1841 |           contract_start_date?: string | null
1842 |           contract_type?: string | null
1843 |           created_at?: string | null
1844 |           date_of_birth?: string | null
1845 |           email?: string | null
1846 |           emergency_contact_name?: string | null
1847 |           emergency_contact_phone?: string | null
1848 |           emergency_contact_relation?: string | null
1849 |           employee_number?: string | null
1850 |           has_company_car?: boolean | null
1851 |           has_pension?: boolean | null
1852 |           hourly_rate?: number | null
1853 |           hours_per_week?: number | null
1854 |           id?: string
1855 |           is_active?: boolean | null
1856 |           lease_amount?: number | null
1857 |           monthly_salary?: number | null
1858 |           name?: string
1859 |           nationality?: string | null
1860 |           notice_period_weeks?: number | null
1861 |           payment_frequency?: string | null
1862 |           pension_percentage?: number | null
1863 |           phone?: string | null
1864 |           postal_code?: string | null
1865 |           probation_end_date?: string | null
1866 |           role?: Database["public"]["Enums"]["user_role_type"]
1867 |           tenant_id?: string
1868 |           unlock_code?: string | null
1869 |           updated_at?: string | null
1870 |           user_id?: string | null
1871 |         }
1872 |         Relationships: [
1873 |           {
1874 |             foreignKeyName: "employees_tenant_id_fkey"
1875 |             columns: ["tenant_id"]
1876 |             isOneToOne: false
1877 |             referencedRelation: "tenants"
1878 |             referencedColumns: ["id"]
1879 |           },
1880 |           {
1881 |             foreignKeyName: "employees_user_id_fkey"
1882 |             columns: ["user_id"]
1883 |             isOneToOne: false
1884 |             referencedRelation: "users"
1885 |             referencedColumns: ["id"]
1886 |           },
1887 |         ]
1888 |       }
1889 |       error_logs: {
1890 |         Row: {
1891 |           context: Json | null
1892 |           created_at: string
1893 |           error_message: string
1894 |           id: string
1895 |           session_id: string | null
1896 |           stack_trace: string | null
1897 |           tenant_id: string | null
1898 |           user_id: string | null
1899 |         }
1900 |         Insert: {
1901 |           context?: Json | null
1902 |           created_at?: string
1903 |           error_message: string
1904 |           id?: string
1905 |           session_id?: string | null
1906 |           stack_trace?: string | null
1907 |           tenant_id?: string | null
1908 |           user_id?: string | null
1909 |         }
1910 |         Update: {
1911 |           context?: Json | null
1912 |           created_at?: string
1913 |           error_message?: string
1914 |           id?: string
1915 |           session_id?: string | null
1916 |           stack_trace?: string | null
1917 |           tenant_id?: string | null
1918 |           user_id?: string | null
1919 |         }
1920 |         Relationships: [
1921 |           {
1922 |             foreignKeyName: "error_logs_tenant_id_fkey"
1923 |             columns: ["tenant_id"]
1924 |             isOneToOne: false
1925 |             referencedRelation: "tenants"
1926 |             referencedColumns: ["id"]
1927 |           },
1928 |         ]
1929 |       }
1930 |       notifications: {
1931 |         Row: {
1932 |           body: string
1933 |           channel: string
1934 |           created_at: string | null
1935 |           id: string
1936 |           metadata: Json | null
1937 |           recipient_id: string | null
1938 |           recipient_phone: string | null
1939 |           recipient_type: string
1940 |           related_appointment_id: string | null
1941 |           sent_at: string | null
1942 |           status: string
1943 |           tenant_id: string
1944 |           title: string
1945 |           type: string
1946 |         }
1947 |         Insert: {
1948 |           body: string
1949 |           channel?: string
1950 |           created_at?: string | null
1951 |           id?: string
1952 |           metadata?: Json | null
1953 |           recipient_id?: string | null
1954 |           recipient_phone?: string | null
1955 |           recipient_type: string
1956 |           related_appointment_id?: string | null
1957 |           sent_at?: string | null
1958 |           status?: string
1959 |           tenant_id: string
1960 |           title: string
1961 |           type: string
1962 |         }
1963 |         Update: {
1964 |           body?: string
1965 |           channel?: string
1966 |           created_at?: string | null
1967 |           id?: string
1968 |           metadata?: Json | null
1969 |           recipient_id?: string | null
1970 |           recipient_phone?: string | null
1971 |           recipient_type?: string
1972 |           related_appointment_id?: string | null
1973 |           sent_at?: string | null
1974 |           status?: string
1975 |           tenant_id?: string
1976 |           title?: string
1977 |           type?: string
1978 |         }
1979 |         Relationships: [
1980 |           {
1981 |             foreignKeyName: "notifications_related_appointment_id_fkey"
1982 |             columns: ["related_appointment_id"]
1983 |             isOneToOne: false
1984 |             referencedRelation: "appointments"
1985 |             referencedColumns: ["id"]
1986 |           },
1987 |           {
1988 |             foreignKeyName: "notifications_tenant_id_fkey"
1989 |             columns: ["tenant_id"]
1990 |             isOneToOne: false
1991 |             referencedRelation: "tenants"
1992 |             referencedColumns: ["id"]
1993 |           },
1994 |         ]
1995 |       }
1996 |       prompt_lab_prompts: {
1997 |         Row: {
1998 |           created_at: string
1999 |           description: string
2000 |           id: string
2001 |           name: string
2002 |           prompt_text: string
2003 |           tags: string[]
2004 |           tenant_id: string
2005 |           updated_at: string
2006 |         }
2007 |         Insert: {
2008 |           created_at?: string
2009 |           description?: string
2010 |           id?: string
2011 |           name: string
2012 |           prompt_text?: string
2013 |           tags?: string[]
2014 |           tenant_id: string
2015 |           updated_at?: string
2016 |         }
2017 |         Update: {
2018 |           created_at?: string
2019 |           description?: string
2020 |           id?: string
2021 |           name?: string
2022 |           prompt_text?: string
2023 |           tags?: string[]
2024 |           tenant_id?: string
2025 |           updated_at?: string
2026 |         }
2027 |         Relationships: [
2028 |           {
2029 |             foreignKeyName: "prompt_lab_prompts_tenant_id_fkey"
2030 |             columns: ["tenant_id"]
2031 |             isOneToOne: false
2032 |             referencedRelation: "tenants"
2033 |             referencedColumns: ["id"]
2034 |           },
2035 |         ]
2036 |       }
2037 |       prompt_lab_session_history: {
2038 |         Row: {
2039 |           created_at: string
2040 |           ended_at: number
2041 |           id: string
2042 |           prompt_text: string | null
2043 |           session_id: string
2044 |           stats: Json
2045 |           tenant_id: string
2046 |           transcript: Json
2047 |         }
2048 |         Insert: {
2049 |           created_at?: string
2050 |           ended_at: number
2051 |           id?: string
2052 |           prompt_text?: string | null
2053 |           session_id: string
2054 |           stats?: Json
2055 |           tenant_id: string
2056 |           transcript?: Json
2057 |         }
2058 |         Update: {
2059 |           created_at?: string
2060 |           ended_at?: number
2061 |           id?: string
2062 |           prompt_text?: string | null
2063 |           session_id?: string
2064 |           stats?: Json
2065 |           tenant_id?: string
2066 |           transcript?: Json
2067 |         }
2068 |         Relationships: [
2069 |           {
2070 |             foreignKeyName: "prompt_lab_session_history_tenant_id_fkey"
2071 |             columns: ["tenant_id"]
2072 |             isOneToOne: false
2073 |             referencedRelation: "tenants"
2074 |             referencedColumns: ["id"]
2075 |           },
2076 |         ]
2077 |       }
2078 |       role_features: {
2079 |         Row: {
2080 |           created_at: string | null
2081 |           enabled: boolean
2082 |           feature_key: string
2083 |           id: string
2084 |           role: string
2085 |           tenant_id: string
2086 |           updated_at: string | null
2087 |         }
2088 |         Insert: {
2089 |           created_at?: string | null
2090 |           enabled?: boolean
2091 |           feature_key: string
2092 |           id?: string
2093 |           role: string
2094 |           tenant_id: string
2095 |           updated_at?: string | null
2096 |         }
2097 |         Update: {
2098 |           created_at?: string | null
2099 |           enabled?: boolean
2100 |           feature_key?: string
2101 |           id?: string
2102 |           role?: string
2103 |           tenant_id?: string
2104 |           updated_at?: string | null
2105 |         }
2106 |         Relationships: [
2107 |           {
2108 |             foreignKeyName: "role_features_tenant_id_fkey"
2109 |             columns: ["tenant_id"]
2110 |             isOneToOne: false
2111 |             referencedRelation: "tenants"
2112 |             referencedColumns: ["id"]
2113 |           },
2114 |         ]
2115 |       }
2116 |       services: {
2117 |         Row: {
2118 |           buffer_minutes: number | null
2119 |           categories: string[] | null
2120 |           created_at: string | null
2121 |           description: string | null
2122 |           duration_minutes: number
2123 |           id: string
2124 |           is_active: boolean | null
2125 |           name: string
2126 |           price: number | null
2127 |           tenant_id: string
2128 |           updated_at: string | null
2129 |         }
2130 |         Insert: {
2131 |           buffer_minutes?: number | null
2132 |           categories?: string[] | null
2133 |           created_at?: string | null
2134 |           description?: string | null
2135 |           duration_minutes: number
2136 |           id?: string
2137 |           is_active?: boolean | null
2138 |           name: string
2139 |           price?: number | null
2140 |           tenant_id: string
2141 |           updated_at?: string | null
2142 |         }
2143 |         Update: {
2144 |           buffer_minutes?: number | null
2145 |           categories?: string[] | null
2146 |           created_at?: string | null
2147 |           description?: string | null
2148 |           duration_minutes?: number
2149 |           id?: string
2150 |           is_active?: boolean | null
2151 |           name?: string
2152 |           price?: number | null
2153 |           tenant_id?: string
2154 |           updated_at?: string | null
2155 |         }
2156 |         Relationships: [
2157 |           {
2158 |             foreignKeyName: "services_tenant_id_fkey"
2159 |             columns: ["tenant_id"]
2160 |             isOneToOne: false
2161 |             referencedRelation: "tenants"
2162 |             referencedColumns: ["id"]
2163 |           },
2164 |         ]
2165 |       }
2166 |       system_logs: {
2167 |         Row: {
2168 |           call_control_id: string | null
2169 |           created_at: string
2170 |           event: string
2171 |           id: string
2172 |           level: string
2173 |           message: string
2174 |           metadata: Json | null
2175 |           session_id: string | null
2176 |           source: string
2177 |           tenant_id: string | null
2178 |         }
2179 |         Insert: {
2180 |           call_control_id?: string | null
2181 |           created_at?: string
2182 |           event: string
2183 |           id?: string
2184 |           level: string
2185 |           message: string
2186 |           metadata?: Json | null
2187 |           session_id?: string | null
2188 |           source: string
2189 |           tenant_id?: string | null
2190 |         }
2191 |         Update: {
2192 |           call_control_id?: string | null
2193 |           created_at?: string
2194 |           event?: string
2195 |           id?: string
2196 |           level?: string
2197 |           message?: string
2198 |           metadata?: Json | null
2199 |           session_id?: string | null
2200 |           source?: string
2201 |           tenant_id?: string | null
2202 |         }
2203 |         Relationships: [
2204 |           {
2205 |             foreignKeyName: "system_logs_tenant_id_fkey"
2206 |             columns: ["tenant_id"]
2207 |             isOneToOne: false
2208 |             referencedRelation: "tenants"
2209 |             referencedColumns: ["id"]
2210 |           },
2211 |         ]
2212 |       }
2213 |       telnyx_numbers: {
2214 |         Row: {
2215 |           assigned_at: string | null
2216 |           connection_id: string | null
2217 |           created_at: string | null
2218 |           id: string
2219 |           phone_number: string
2220 |           released_at: string | null
2221 |           status: Database["public"]["Enums"]["telnyx_status_type"] | null
2222 |           tenant_id: string | null
2223 |           updated_at: string | null
2224 |         }
2225 |         Insert: {
2226 |           assigned_at?: string | null
2227 |           connection_id?: string | null
2228 |           created_at?: string | null
2229 |           id?: string
2230 |           phone_number: string
2231 |           released_at?: string | null
2232 |           status?: Database["public"]["Enums"]["telnyx_status_type"] | null
2233 |           tenant_id?: string | null
2234 |           updated_at?: string | null
2235 |         }
2236 |         Update: {
2237 |           assigned_at?: string | null
2238 |           connection_id?: string | null
2239 |           created_at?: string | null
2240 |           id?: string
2241 |           phone_number?: string
2242 |           released_at?: string | null
2243 |           status?: Database["public"]["Enums"]["telnyx_status_type"] | null
2244 |           tenant_id?: string | null
2245 |           updated_at?: string | null
2246 |         }
2247 |         Relationships: [
2248 |           {
2249 |             foreignKeyName: "telnyx_numbers_tenant_id_fkey"
2250 |             columns: ["tenant_id"]
2251 |             isOneToOne: false
2252 |             referencedRelation: "tenants"
2253 |             referencedColumns: ["id"]
2254 |           },
2255 |         ]
2256 |       }
2257 |       temp_reservations: {
2258 |         Row: {
2259 |           created_at: string | null
2260 |           employee_id: string | null
2261 |           end_time: string
2262 |           expires_at: string
2263 |           id: string
2264 |           service_id: string | null
2265 |           session_id: string
2266 |           start_time: string
2267 |           status: string | null
2268 |           tenant_id: string
2269 |         }
2270 |         Insert: {
2271 |           created_at?: string | null
2272 |           employee_id?: string | null
2273 |           end_time: string
2274 |           expires_at: string
2275 |           id?: string
2276 |           service_id?: string | null
2277 |           session_id: string
2278 |           start_time: string
2279 |           status?: string | null
2280 |           tenant_id: string
2281 |         }
2282 |         Update: {
2283 |           created_at?: string | null
2284 |           employee_id?: string | null
2285 |           end_time?: string
2286 |           expires_at?: string
2287 |           id?: string
2288 |           service_id?: string | null
2289 |           session_id?: string
2290 |           start_time?: string
2291 |           status?: string | null
2292 |           tenant_id?: string
2293 |         }
2294 |         Relationships: [
2295 |           {
2296 |             foreignKeyName: "temp_reservations_employee_id_fkey"
2297 |             columns: ["employee_id"]
2298 |             isOneToOne: false
2299 |             referencedRelation: "employees"
2300 |             referencedColumns: ["id"]
2301 |           },
2302 |           {
2303 |             foreignKeyName: "temp_reservations_service_id_fkey"
2304 |             columns: ["service_id"]
2305 |             isOneToOne: false
2306 |             referencedRelation: "services"
2307 |             referencedColumns: ["id"]
2308 |           },
2309 |           {
2310 |             foreignKeyName: "temp_reservations_tenant_id_fkey"
2311 |             columns: ["tenant_id"]
2312 |             isOneToOne: false
2313 |             referencedRelation: "tenants"
2314 |             referencedColumns: ["id"]
2315 |           },
2316 |         ]
2317 |       }
2318 |       tenant_billing_stats: {
2319 |         Row: {
2320 |           created_at: string | null
2321 |           current_period_end: string
2322 |           current_period_start: string
2323 |           id: string
2324 |           included_minutes: number | null
2325 |           pack_minutes_remaining: number | null
2326 |           tenant_id: string
2327 |           updated_at: string | null
2328 |           used_minutes: number | null
2329 |         }
2330 |         Insert: {
2331 |           created_at?: string | null
2332 |           current_period_end?: string
2333 |           current_period_start?: string
2334 |           id?: string
2335 |           included_minutes?: number | null
2336 |           pack_minutes_remaining?: number | null
2337 |           tenant_id: string
2338 |           updated_at?: string | null
2339 |           used_minutes?: number | null
2340 |         }
2341 |         Update: {
2342 |           created_at?: string | null
2343 |           current_period_end?: string
2344 |           current_period_start?: string
2345 |           id?: string
2346 |           included_minutes?: number | null
2347 |           pack_minutes_remaining?: number | null
2348 |           tenant_id?: string
2349 |           updated_at?: string | null
2350 |           used_minutes?: number | null
2351 |         }
2352 |         Relationships: [
2353 |           {
2354 |             foreignKeyName: "tenant_billing_stats_tenant_id_fkey"
2355 |             columns: ["tenant_id"]
2356 |             isOneToOne: true
2357 |             referencedRelation: "tenants"
2358 |             referencedColumns: ["id"]
2359 |           },
2360 |         ]
2361 |       }
2362 |       tenant_settings: {
2363 |         Row: {
2364 |           ai_appointment_confirmation_style: string | null
2365 |           ai_background_noise_enabled: boolean | null
2366 |           ai_background_noise_type: string | null
2367 |           ai_background_noise_volume: number | null
2368 |           ai_custom_closing: string | null
2369 |           ai_custom_greeting: string | null
2370 |           ai_custom_personality_text: string | null
2371 |           ai_customer_recognition_style: string | null
2372 |           ai_emergency_protocol: string | null
2373 |           ai_error_handling_tone: string | null
2374 |           ai_greeting: string | null
2375 |           ai_language: string | null
2376 |           ai_language_mode: string | null
2377 |           ai_max_time_options: number | null
2378 |           ai_model: string | null
2379 |           ai_name: string | null
2380 |           ai_name_gathering_style: string | null
2381 |           ai_no_availability_style: string | null
2382 |           ai_personality_preset: string | null
2383 |           ai_phone_verification_style: string | null
2384 |           ai_response_verbosity: string | null
2385 |           ai_service_explanation_verbosity: string | null
2386 |           ai_silence_timeout_ms: number | null
2387 |           ai_time_slot_presentation_style: string | null
2388 |           ai_tone: string | null
2389 |           ai_vad_threshold: number | null
2390 |           ai_voice: string | null
2391 |           calendar_end_hour: number | null
2392 |           calendar_start_hour: number | null
2393 |           calendar_zoom_level: number | null
2394 |           created_at: string | null
2395 |           custom_instructions: string | null
2396 |           handoff_action:
2397 |             | Database["public"]["Enums"]["handoff_action_type"]
2398 |             | null
2399 |           handoff_phone_number: string | null
2400 |           holidays: Json | null
2401 |           id: string
2402 |           kiosk_greeting: string | null
2403 |           kiosk_lock_timeout_minutes: number | null
2404 |           kiosk_mode_enabled: boolean | null
2405 |           kiosk_show_notifications: boolean
2406 |           kiosk_show_schedule: boolean
2407 |           master_code: string | null
2408 |           planning_horizon_weeks: number | null
2409 |           routing_end_time: string | null
2410 |           routing_start_time: string | null
2411 |           tenant_id: string
2412 |           updated_at: string | null
2413 |         }
2414 |         Insert: {
2415 |           ai_appointment_confirmation_style?: string | null
2416 |           ai_background_noise_enabled?: boolean | null
2417 |           ai_background_noise_type?: string | null
2418 |           ai_background_noise_volume?: number | null
2419 |           ai_custom_closing?: string | null
2420 |           ai_custom_greeting?: string | null
2421 |           ai_custom_personality_text?: string | null
2422 |           ai_customer_recognition_style?: string | null
2423 |           ai_emergency_protocol?: string | null
2424 |           ai_error_handling_tone?: string | null
2425 |           ai_greeting?: string | null
2426 |           ai_language?: string | null
2427 |           ai_language_mode?: string | null
2428 |           ai_max_time_options?: number | null
2429 |           ai_model?: string | null
2430 |           ai_name?: string | null
2431 |           ai_name_gathering_style?: string | null
2432 |           ai_no_availability_style?: string | null
2433 |           ai_personality_preset?: string | null
2434 |           ai_phone_verification_style?: string | null
2435 |           ai_response_verbosity?: string | null
2436 |           ai_service_explanation_verbosity?: string | null
2437 |           ai_silence_timeout_ms?: number | null
2438 |           ai_time_slot_presentation_style?: string | null
2439 |           ai_tone?: string | null
2440 |           ai_vad_threshold?: number | null
2441 |           ai_voice?: string | null
2442 |           calendar_end_hour?: number | null
2443 |           calendar_start_hour?: number | null
2444 |           calendar_zoom_level?: number | null
2445 |           created_at?: string | null
2446 |           custom_instructions?: string | null
2447 |           handoff_action?:
2448 |             | Database["public"]["Enums"]["handoff_action_type"]
2449 |             | null
2450 |           handoff_phone_number?: string | null
2451 |           holidays?: Json | null
2452 |           id?: string
2453 |           kiosk_greeting?: string | null
2454 |           kiosk_lock_timeout_minutes?: number | null
2455 |           kiosk_mode_enabled?: boolean | null
2456 |           kiosk_show_notifications?: boolean
2457 |           kiosk_show_schedule?: boolean
2458 |           master_code?: string | null
2459 |           planning_horizon_weeks?: number | null
2460 |           routing_end_time?: string | null
2461 |           routing_start_time?: string | null
2462 |           tenant_id: string
2463 |           updated_at?: string | null
2464 |         }
2465 |         Update: {
2466 |           ai_appointment_confirmation_style?: string | null
2467 |           ai_background_noise_enabled?: boolean | null
2468 |           ai_background_noise_type?: string | null
2469 |           ai_background_noise_volume?: number | null
2470 |           ai_custom_closing?: string | null
2471 |           ai_custom_greeting?: string | null
2472 |           ai_custom_personality_text?: string | null
2473 |           ai_customer_recognition_style?: string | null
2474 |           ai_emergency_protocol?: string | null
2475 |           ai_error_handling_tone?: string | null
2476 |           ai_greeting?: string | null
2477 |           ai_language?: string | null
2478 |           ai_language_mode?: string | null
2479 |           ai_max_time_options?: number | null
2480 |           ai_model?: string | null
2481 |           ai_name?: string | null
2482 |           ai_name_gathering_style?: string | null
2483 |           ai_no_availability_style?: string | null
2484 |           ai_personality_preset?: string | null
2485 |           ai_phone_verification_style?: string | null
2486 |           ai_response_verbosity?: string | null
2487 |           ai_service_explanation_verbosity?: string | null
2488 |           ai_silence_timeout_ms?: number | null
2489 |           ai_time_slot_presentation_style?: string | null
2490 |           ai_tone?: string | null
2491 |           ai_vad_threshold?: number | null
2492 |           ai_voice?: string | null
2493 |           calendar_end_hour?: number | null
2494 |           calendar_start_hour?: number | null
2495 |           calendar_zoom_level?: number | null
2496 |           created_at?: string | null
2497 |           custom_instructions?: string | null
2498 |           handoff_action?:
2499 |             | Database["public"]["Enums"]["handoff_action_type"]
2500 |             | null
2501 |           handoff_phone_number?: string | null
2502 |           holidays?: Json | null
2503 |           id?: string
2504 |           kiosk_greeting?: string | null
2505 |           kiosk_lock_timeout_minutes?: number | null
2506 |           kiosk_mode_enabled?: boolean | null
2507 |           kiosk_show_notifications?: boolean
2508 |           kiosk_show_schedule?: boolean
2509 |           master_code?: string | null
2510 |           planning_horizon_weeks?: number | null
2511 |           routing_end_time?: string | null
2512 |           routing_start_time?: string | null
2513 |           tenant_id?: string
2514 |           updated_at?: string | null
2515 |         }
2516 |         Relationships: [
2517 |           {
2518 |             foreignKeyName: "tenant_settings_tenant_id_fkey"
2519 |             columns: ["tenant_id"]
2520 |             isOneToOne: true
2521 |             referencedRelation: "tenants"
2522 |             referencedColumns: ["id"]
2523 |           },
2524 |         ]
2525 |       }
2526 |       tenants: {
2527 |         Row: {
2528 |           address: string | null
2529 |           city: string | null
2530 |           created_at: string | null
2531 |           house_number: string | null
2532 |           id: string
2533 |           is_active: boolean | null
2534 |           kvk_number: string | null
2535 |           name: string
2536 |           slug: string
2537 |           stripe_customer_id: string | null
2538 |           subscription_tier: string | null
2539 |           timezone: string
2540 |           trial_ends_at: string | null
2541 |           updated_at: string | null
2542 |           zipcode: string | null
2543 |         }
2544 |         Insert: {
2545 |           address?: string | null
2546 |           city?: string | null
2547 |           created_at?: string | null
2548 |           house_number?: string | null
2549 |           id?: string
2550 |           is_active?: boolean | null
2551 |           kvk_number?: string | null
2552 |           name: string
2553 |           slug: string
2554 |           stripe_customer_id?: string | null
2555 |           subscription_tier?: string | null
2556 |           timezone?: string
2557 |           trial_ends_at?: string | null
2558 |           updated_at?: string | null
2559 |           zipcode?: string | null
2560 |         }
2561 |         Update: {
2562 |           address?: string | null
2563 |           city?: string | null
2564 |           created_at?: string | null
2565 |           house_number?: string | null
2566 |           id?: string
2567 |           is_active?: boolean | null
2568 |           kvk_number?: string | null
2569 |           name?: string
2570 |           slug?: string
2571 |           stripe_customer_id?: string | null
2572 |           subscription_tier?: string | null
2573 |           timezone?: string
2574 |           trial_ends_at?: string | null
2575 |           updated_at?: string | null
2576 |           zipcode?: string | null
2577 |         }
2578 |         Relationships: []
2579 |       }
2580 |       user_sessions: {
2581 |         Row: {
2582 |           created_at: string
2583 |           ip_address: string | null
2584 |           metadata: Json | null
2585 |           referring_url: string | null
2586 |           session_end: string | null
2587 |           session_id: string
2588 |           session_start: string
2589 |           source_channel: string
2590 |           user_agent: string | null
2591 |           user_id: string | null
2592 |         }
2593 |         Insert: {
2594 |           created_at?: string
2595 |           ip_address?: string | null
2596 |           metadata?: Json | null
2597 |           referring_url?: string | null
2598 |           session_end?: string | null
2599 |           session_id: string
2600 |           session_start?: string
2601 |           source_channel?: string
2602 |           user_agent?: string | null
2603 |           user_id?: string | null
2604 |         }
2605 |         Update: {
2606 |           created_at?: string
2607 |           ip_address?: string | null
2608 |           metadata?: Json | null
2609 |           referring_url?: string | null
2610 |           session_end?: string | null
2611 |           session_id?: string
2612 |           session_start?: string
2613 |           source_channel?: string
2614 |           user_agent?: string | null
2615 |           user_id?: string | null
2616 |         }
2617 |         Relationships: []
2618 |       }
2619 |       users: {
2620 |         Row: {
2621 |           created_at: string | null
2622 |           first_name: string | null
2623 |           id: string
2624 |           last_name: string | null
2625 |           marketing_consent: boolean | null
2626 |           phone: string | null
2627 |           role: Database["public"]["Enums"]["user_role_type"] | null
2628 |           tenant_id: string
2629 |           terms_accepted: boolean | null
2630 |           updated_at: string | null
2631 |         }
2632 |         Insert: {
2633 |           created_at?: string | null
2634 |           first_name?: string | null
2635 |           id: string
2636 |           last_name?: string | null
2637 |           marketing_consent?: boolean | null
2638 |           phone?: string | null
2639 |           role?: Database["public"]["Enums"]["user_role_type"] | null
2640 |           tenant_id: string
2641 |           terms_accepted?: boolean | null
2642 |           updated_at?: string | null
2643 |         }
2644 |         Update: {
2645 |           created_at?: string | null
2646 |           first_name?: string | null
2647 |           id?: string
2648 |           last_name?: string | null
2649 |           marketing_consent?: boolean | null
2650 |           phone?: string | null
2651 |           role?: Database["public"]["Enums"]["user_role_type"] | null
2652 |           tenant_id?: string
2653 |           terms_accepted?: boolean | null
2654 |           updated_at?: string | null
2655 |         }
2656 |         Relationships: [
2657 |           {
2658 |             foreignKeyName: "users_tenant_id_fkey"
2659 |             columns: ["tenant_id"]
2660 |             isOneToOne: false
2661 |             referencedRelation: "tenants"
2662 |             referencedColumns: ["id"]
2663 |           },
2664 |         ]
2665 |       }
2666 |     }
2667 |     Views: {
2668 |       [_ in never]: never
2669 |     }
2670 |     Functions: {
2671 |       add_pack_minutes: {
2672 |         Args: { p_minutes: number; p_tenant_id: string }
2673 |         Returns: undefined
2674 |       }
2675 |       book_appointment_atomic:
2676 |         | {
2677 |             Args: {
2678 |               p_customer_id: string
2679 |               p_employee_id: string
2680 |               p_end_time: string
2681 |               p_service_id: string
2682 |               p_session_id?: string
2683 |               p_source?: string
2684 |               p_start_time: string
2685 |               p_tenant_id: string
2686 |             }
2687 |             Returns: Json
2688 |           }
2689 |         | {
2690 |             Args: {
2691 |               p_customer_id: string
2692 |               p_employee_id: string
2693 |               p_end_time: string
2694 |               p_service_id: string
2695 |               p_source?: Database["public"]["Enums"]["appointment_source_type"]
2696 |               p_start_time: string
2697 |               p_tenant_id: string
2698 |             }
2699 |             Returns: string
2700 |           }
2701 |       create_tenant_and_user:
2702 |         | {
2703 |             Args: {
2704 |               p_address: string
2705 |               p_city: string
2706 |               p_first_name: string
2707 |               p_house_number: string
2708 |               p_kvk_number: string
2709 |               p_last_name: string
2710 |               p_marketing_consent?: boolean
2711 |               p_phone: string
2712 |               p_tenant_name: string
2713 |               p_tenant_slug: string
2714 |               p_terms_accepted?: boolean
2715 |               p_timezone?: string
2716 |               p_zipcode: string
2717 |             }
2718 |             Returns: string
2719 |           }
2720 |         | {
2721 |             Args: {
2722 |               p_first_name: string
2723 |               p_last_name: string
2724 |               p_tenant_name: string
2725 |               p_tenant_slug: string
2726 |               p_timezone?: string
2727 |             }
2728 |             Returns: string
2729 |           }
2730 |         | {
2731 |             Args: {
2732 |               p_first_name: string
2733 |               p_last_name: string
2734 |               p_marketing_consent?: boolean
2735 |               p_tenant_name: string
2736 |               p_tenant_slug: string
2737 |               p_terms_accepted?: boolean
2738 |               p_timezone?: string
2739 |             }
2740 |             Returns: string
2741 |           }
2742 |       get_auth_tenant_id: { Args: never; Returns: string }
2743 |       get_available_slots: {
2744 |         Args: {
2745 |           p_date: string
2746 |           p_employee_id?: string
2747 |           p_service_id: string
2748 |           p_tenant_id: string
2749 |         }
2750 |         Returns: {
2751 |           employee_id: string
2752 |           employee_name: string
2753 |           slot_end: string
2754 |           slot_start: string
2755 |         }[]
2756 |       }
2757 |       get_employee_services: {
2758 |         Args: { p_employee_id?: string; p_tenant_id: string }
2759 |         Returns: {
2760 |           duration_minutes: number
2761 |           employee_id: string
2762 |           employee_name: string
2763 |           price: number
2764 |           service_id: string
2765 |           service_name: string
2766 |         }[]
2767 |       }
2768 |       get_employee_working_days: {
2769 |         Args: { p_employee_id?: string; p_tenant_id: string }
2770 |         Returns: {
2771 |           day_name: string
2772 |           day_of_week: number
2773 |           employee_id: string
2774 |           employee_name: string
2775 |           end_time: string
2776 |           start_time: string
2777 |         }[]
2778 |       }
2779 |       get_employees: {
2780 |         Args: { p_employee_id?: string; p_tenant_id: string }
2781 |         Returns: {
2782 |           color: string
2783 |           id: string
2784 |           is_active: boolean
2785 |           name: string
2786 |           phone: string
2787 |         }[]
2788 |       }
2789 |       process_expired_trials: { Args: never; Returns: number }
2790 |       set_tenant_context: { Args: { p_tenant_id: string }; Returns: undefined }
2791 |     }
2792 |     Enums: {
2793 |       appointment_source_type: "AI_VOICE" | "WEB" | "MANUAL" | "WIDGET"
2794 |       appointment_status_type:
2795 |         | "PENDING"
2796 |         | "CONFIRMED"
2797 |         | "CANCELLED"
2798 |         | "NO_SHOW"
2799 |         | "COMPLETED"
2800 |       call_status_type: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED"
2801 |       contract_type_enum:
2802 |         | "full_time"
2803 |         | "part_time"
2804 |         | "flex"
2805 |         | "intern"
2806 |         | "contractor"
2807 |       handoff_action_type: "CALL_BACK" | "FORWARD_CALL"
2808 |       step_type_enum:
2809 |         | "USER_SPEECH"
2810 |         | "AI_SPEECH"
2811 |         | "TOOL_CALL"
2812 |         | "TOOL_RESULT"
2813 |         | "SYSTEM_ERROR"
2814 |         | "SESSION_INIT"
2815 |         | "CONTEXT_UPDATE"
2816 |         | "AI_METADATA"
2817 |         | "TOOL_CHAIN_INFO"
2818 |       suggestion_status_type: "PENDING" | "APPLIED" | "REJECTED" | "IGNORED"
2819 |       suggestion_type_enum: "SYSTEM_PROMPT_TWEAK" | "NEW_KNOWLEDGE" | "TOOL_FIX"
2820 |       telnyx_status_type: "AVAILABLE" | "ASSIGNED" | "PENDING_RELEASE"
2821 |       user_role_type: "OWNER" | "ADMIN" | "MANAGER" | "STAFF"
2822 |     }
2823 |     CompositeTypes: {
2824 |       [_ in never]: never
2825 |     }
2826 |   }
2827 | }
2828 | 
2829 | type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
2830 | 
2831 | type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]
2832 | 
2833 | export type Tables<
2834 |   DefaultSchemaTableNameOrOptions extends
2835 |     | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
2836 |     | { schema: keyof DatabaseWithoutInternals },
2837 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2838 |     schema: keyof DatabaseWithoutInternals
2839 |   }
2840 |     ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
2841 |         DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
2842 |     : never = never,
2843 | > = DefaultSchemaTableNameOrOptions extends {
2844 |   schema: keyof DatabaseWithoutInternals
2845 | }
2846 |   ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
2847 |       DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
2848 |       Row: infer R
2849 |     }
2850 |     ? R
2851 |     : never
2852 |   : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
2853 |         DefaultSchema["Views"])
2854 |     ? (DefaultSchema["Tables"] &
2855 |         DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
2856 |         Row: infer R
2857 |       }
2858 |       ? R
2859 |       : never
2860 |     : never
2861 | 
2862 | export type TablesInsert<
2863 |   DefaultSchemaTableNameOrOptions extends
2864 |     | keyof DefaultSchema["Tables"]
2865 |     | { schema: keyof DatabaseWithoutInternals },
2866 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2867 |     schema: keyof DatabaseWithoutInternals
2868 |   }
2869 |     ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
2870 |     : never = never,
2871 | > = DefaultSchemaTableNameOrOptions extends {
2872 |   schema: keyof DatabaseWithoutInternals
2873 | }
2874 |   ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
2875 |       Insert: infer I
2876 |     }
2877 |     ? I
2878 |     : never
2879 |   : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
2880 |     ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
2881 |         Insert: infer I
2882 |       }
2883 |       ? I
2884 |       : never
2885 |     : never
2886 | 
2887 | export type TablesUpdate<
2888 |   DefaultSchemaTableNameOrOptions extends
2889 |     | keyof DefaultSchema["Tables"]
2890 |     | { schema: keyof DatabaseWithoutInternals },
2891 |   TableName extends DefaultSchemaTableNameOrOptions extends {
2892 |     schema: keyof DatabaseWithoutInternals
2893 |   }
2894 |     ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
2895 |     : never = never,
2896 | > = DefaultSchemaTableNameOrOptions extends {
2897 |   schema: keyof DatabaseWithoutInternals
2898 | }
2899 |   ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
2900 |       Update: infer U
2901 |     }
2902 |     ? U
2903 |     : never
2904 |   : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
2905 |     ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
2906 |         Update: infer U
2907 |       }
2908 |       ? U
2909 |       : never
2910 |     : never
2911 | 
2912 | export type Enums<
2913 |   DefaultSchemaEnumNameOrOptions extends
2914 |     | keyof DefaultSchema["Enums"]
2915 |     | { schema: keyof DatabaseWithoutInternals },
2916 |   EnumName extends DefaultSchemaEnumNameOrOptions extends {
2917 |     schema: keyof DatabaseWithoutInternals
2918 |   }
2919 |     ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
2920 |     : never = never,
2921 | > = DefaultSchemaEnumNameOrOptions extends {
2922 |   schema: keyof DatabaseWithoutInternals
2923 | }
2924 |   ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
2925 |   : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
2926 |     ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
2927 |     : never
2928 | 
2929 | export type CompositeTypes<
2930 |   PublicCompositeTypeNameOrOptions extends
2931 |     | keyof DefaultSchema["CompositeTypes"]
2932 |     | { schema: keyof DatabaseWithoutInternals },
2933 |   CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
2934 |     schema: keyof DatabaseWithoutInternals
2935 |   }
2936 |     ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
2937 |     : never = never,
2938 | > = PublicCompositeTypeNameOrOptions extends {
2939 |   schema: keyof DatabaseWithoutInternals
2940 | }
2941 |   ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
2942 |   : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
2943 |     ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
2944 |     : never
2945 | 
2946 | /**
2947 |  * Tenant Settings - Dynamic AI configuration per tenant
2948 |  */
2949 | export interface TenantSettings {
2950 |   tenant_id: string;
2951 |   ai_name?: string | null;
2952 |   ai_voice?: string | null;
2953 |   ai_language?: string | null;
2954 |   ai_tone?: string | null;
2955 |   ai_temperature?: number | null;
2956 |   business_name?: string | null;
2957 |   custom_instructions?: string | null;
2958 |   [key: string]: any; // Allow other Supabase fields
2959 | }
2960 | 
2961 | /**
2962 |  * Call Trace - Audit log for call events
2963 |  */
2964 | export interface CallTrace {
2965 |   call_log_id: string;
2966 |   tenant_id: string;
2967 |   step_type: string;
2968 |   content?: any;
2969 |   latency_ms?: number;
2970 |   created_at?: string;
2971 | }
2972 | 
2973 | export const Constants = {
2974 |   public: {
2975 |     Enums: {
2976 |       appointment_source_type: ["AI_VOICE", "WEB", "MANUAL", "WIDGET"],
2977 |       appointment_status_type: [
2978 |         "PENDING",
2979 |         "CONFIRMED",
2980 |         "CANCELLED",
2981 |         "NO_SHOW",
2982 |         "COMPLETED",
2983 |       ],
2984 |       call_status_type: ["IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"],
2985 |       contract_type_enum: [
2986 |         "full_time",
2987 |         "part_time",
2988 |         "flex",
2989 |         "intern",
2990 |         "contractor",
2991 |       ],
2992 |       handoff_action_type: ["CALL_BACK", "FORWARD_CALL"],
2993 |       step_type_enum: [
2994 |         "USER_SPEECH",
2995 |         "AI_SPEECH",
2996 |         "TOOL_CALL",
2997 |         "TOOL_RESULT",
2998 |         "SYSTEM_ERROR",
2999 |         "SESSION_INIT",
3000 |         "CONTEXT_UPDATE",
3001 |         "AI_METADATA",
3002 |         "TOOL_CHAIN_INFO",
3003 |       ],
3004 |       suggestion_status_type: ["PENDING", "APPLIED", "REJECTED", "IGNORED"],
3005 |       suggestion_type_enum: [
3006 |         "SYSTEM_PROMPT_TWEAK",
3007 |         "NEW_KNOWLEDGE",
3008 |         "TOOL_FIX",
3009 |       ],
3010 |       telnyx_status_type: ["AVAILABLE", "ASSIGNED", "PENDING_RELEASE"],
3011 |       user_role_type: ["OWNER", "ADMIN", "MANAGER", "STAFF"],
3012 |     },
3013 |   },
3014 | } as const
3015 | 
```

