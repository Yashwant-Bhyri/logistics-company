-- Optional physical design for benchmarking "before / after index" narratives.
-- Run against LOGISTICS_COMPANY after loading seed data.
-- InnoDB builds secondary indexes as B-tree by default.

-- C_ORDER — customer-visible order lists (tracking assistant context, admin lookups)
CREATE INDEX IX_C_ORDER_SENDER ON C_ORDER (sender_id);
CREATE INDEX IX_C_ORDER_RECEIVER ON C_ORDER (receiver_id);

-- DELIVERY — assignment + order joins (shipment context for AI)
CREATE INDEX IX_DELIVERY_ORDER ON DELIVERY (order_id);
CREATE INDEX IX_DELIVERY_ASSIGNMENT ON DELIVERY (assignment_id);

-- DRIVER_VEHICLE_ASSIGNMENT — driver dashboard & availability queries
CREATE INDEX IX_DVA_DRIVER_STATUS ON DRIVER_VEHICLE_ASSIGNMENT (driver_id, status);

-- ORDER_UPDATE — recent timeline per order
CREATE INDEX IX_ORDER_UPDATE_ORDER_TIME ON ORDER_UPDATE (order_id, updated_at);

-- CONDITION_REPORT — route risk & high-risk filters
CREATE INDEX IX_COND_ROUTE ON CONDITION_REPORT (route_id);
CREATE INDEX IX_COND_RISK_TIME ON CONDITION_REPORT (risk_score, recorded_at);

-- SUPPORT_MESSAGE — created at runtime by app; create table + indexes if using this file standalone.
-- See ai_routes._support_ensure_table for column list.
/*
CREATE INDEX IX_SUPPORT_PARTICIPANT ON SUPPORT_MESSAGE (participant_type, participant_id, message_id);
CREATE INDEX IX_SUPPORT_ORDER ON SUPPORT_MESSAGE (related_order_id);
*/
