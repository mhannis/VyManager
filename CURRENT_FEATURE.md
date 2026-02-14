feature_id: services-event-handler-2026-02-14
status: done
title: Services slice - Event Handler
branch: feature/containers-automation-v1
commits:
  - uncommitted
notes:
  - Added backend wrapper for `/vyos/service-event-handler`.
  - Added form-driven Event Handler tab in `/system/services` (events, filters, script path/args, environment vars).
  - Extended `Services` sidebar links and smoke routes to include the event handler page.
  - Updated coverage token aliases (`eventhandler` <-> `event_handler`) so matrix status reflects backend support correctly.
  - Regenerated coverage artifacts; services domain improved from 17/6/0 to 19/4/0 implemented/partial/not_started.
