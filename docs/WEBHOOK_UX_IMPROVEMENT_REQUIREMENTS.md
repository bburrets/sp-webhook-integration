# SharePoint Webhook Integration - UX Improvement Requirements

**Document Version:** 1.0
**Date:** December 10, 2025
**Status:** Draft
**Owner:** Engineering Team
**Stakeholders:** Operations Team, RPA Team, End Users

---

## Executive Summary

This document outlines requirements for improving the user experience and clarity of the SharePoint to UiPath Webhook Integration solution. The current system is fully functional but suffers from terminology confusion and lack of user-friendly configuration tools.

**Primary Goals:**
1. Standardize and clarify terminology to reduce confusion
2. Provide helper APIs for webhook configuration
3. Improve documentation and self-service capabilities
4. Maintain 100% backward compatibility with existing webhooks

**Expected Outcomes:**
- 50% reduction in configuration-related support tickets
- Faster onboarding for new users
- Reduced errors in webhook setup
- Self-documenting webhook configurations

---

## 1. Business Requirements

### 1.1 Problem Statement

**Current Issues:**
- `processor:` keyword is overloaded with multiple meanings
- ClientState strings are cryptic and error-prone to construct manually
- No validation available before webhook creation
- No discovery mechanism for available templates/handlers
- Difficult to understand what a webhook does by looking at its clientState

**Impact:**
- High support burden for webhook configuration
- Configuration errors leading to failed processing
- Long learning curve for new team members
- Difficulty maintaining and auditing existing webhooks

### 1.2 Business Objectives

| Objective | Success Metric | Timeline |
|-----------|---------------|----------|
| Reduce configuration errors | 80% reduction in malformed clientState | 3 months |
| Improve user onboarding | New users self-configure webhooks in <30 min | 2 months |
| Increase transparency | 100% of webhooks have human-readable descriptions | 1 month |
| Maintain reliability | Zero breaking changes to existing webhooks | Ongoing |

---

## 2. Functional Requirements

### 2.1 Terminology Standardization

#### REQ-TERM-001: Standardize ClientState Schema
**Priority:** High
**Status:** Proposed

**Current State:**
```
processor:uipath;processor:document;uipath:QueueName;env:PROD;folder:606837;config:AccountingResearch
```

**Required State:**
```
destination:uipath|handler:document|queue:QueueName|tenant:PROD|folder:606837|label:AccountingResearch
```

**Mapping Table:**

| Old Keyword | New Keyword | Rationale |
|-------------|-------------|-----------|
| `processor:uipath` | `destination:uipath` | Clarifies routing destination |
| `processor:document` | `handler:document` | Clarifies processing template |
| `uipath:QueueName` | `queue:QueueName` | Removes redundancy |
| `env:PROD` | `tenant:PROD` | More accurate terminology |
| `config:Label` | `label:Label` | Clarifies purpose as identifier |
| `;` (semicolon) | `|` (pipe) | Better visual separation |

**Acceptance Criteria:**
- [ ] Parser supports both old and new formats
- [ ] All new webhooks use new format by default
- [ ] Existing webhooks continue to work unchanged
- [ ] Documentation updated with new terminology
- [ ] Migration guide provided for updating existing webhooks

---

#### REQ-TERM-002: Consistent Handler Terminology
**Priority:** Medium
**Status:** Proposed

**Requirement:**
Replace inconsistent usage of "processor", "template", "type", and "mode" with standardized "handler" terminology.

**Current Inconsistencies:**
- "document processor template"
- "COSTCO template"
- "processor type"
- "mode:withChanges"

**Proposed Standard:**
- `handler:document` - Document processing handler
- `handler:costco` - COSTCO routing handler
- `handler:custom` - Custom handler
- `changeDetection:enabled` (instead of `mode:withChanges`)

**Acceptance Criteria:**
- [ ] All code uses "handler" terminology consistently
- [ ] Documentation uses "handler" terminology
- [ ] API responses use "handler" terminology
- [ ] Backward compatibility maintained for old terms

---

### 2.2 Configuration Builder API

#### REQ-API-001: Webhook Configuration Builder Endpoint
**Priority:** High
**Status:** Required

**Endpoint:** `POST /api/webhook-config-builder`

**Request Payload:**
```json
{
  "destination": "uipath",
  "handler": "document",
  "queue": "FIN_SCAN_Rename_And_Storage",
  "tenant": "PROD",
  "folder": "606837",
  "label": "AccountingResearch"
}
```

**Response Payload:**
```json
{
  "clientState": "destination:uipath|handler:document|queue:FIN_SCAN_Rename_And_Storage|tenant:PROD|folder:606837|label:AccountingResearch",
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  },
  "preview": {
    "description": "Routes documents to UiPath PROD tenant folder 606837, queue FIN_SCAN_Rename_And_Storage",
    "effectiveConfig": {
      "tenantName": "FAMBrands_RPAOPS_PROD",
      "orchestratorUrl": "https://cloud.uipath.com/fambrdpwrgnn/FAMBrands_RPAOPS_PROD/orchestrator_",
      "organizationUnitId": "606837"
    }
  }
}
```

**Validation Rules:**
1. `destination` must be one of: `uipath`, `forward`
2. `handler` required when `destination:uipath`
3. `queue` required when `destination:uipath`
4. `tenant` must be one of: `DEV`, `PROD`
5. `folder` must be numeric string
6. `url` required when `destination:forward`
7. Validate queue exists in specified folder (warning if not found)

**Acceptance Criteria:**
- [ ] Endpoint accepts JSON configuration
- [ ] Returns properly formatted clientState string
- [ ] Validates all required fields
- [ ] Provides warnings for suspicious configurations
- [ ] Generates human-readable description
- [ ] Shows effective configuration preview
- [ ] Response time < 500ms

---

#### REQ-API-002: Webhook Templates Catalog Endpoint
**Priority:** High
**Status:** Required

**Endpoint:** `GET /api/webhook-templates`

**Response Payload:**
```json
{
  "templates": [
    {
      "id": "document",
      "name": "Generic Document Processor",
      "description": "Monitor document libraries and submit files to UiPath",
      "category": "uipath",
      "requiredParams": ["queue", "tenant", "folder"],
      "optionalParams": ["label"],
      "exampleClientState": "destination:uipath|handler:document|queue:MyQueue|tenant:PROD|folder:606837",
      "useCases": [
        "Invoice processing",
        "Receipt scanning",
        "Document archival"
      ]
    },
    {
      "id": "costco",
      "name": "COSTCO Inline Routing",
      "description": "Process COSTCO routing forms when status changes to 'Send Generated Form'",
      "category": "uipath",
      "requiredParams": ["queue", "tenant", "folder"],
      "triggers": {
        "field": "Status",
        "value": "Send Generated Form"
      },
      "requiredFields": ["Ship_To_Email", "Ship_Date", "Style", "PO_no"],
      "exampleClientState": "destination:uipath|handler:costco|queue:COSTCO_Queue|tenant:PROD|folder:376892"
    },
    {
      "id": "forward-simple",
      "name": "Simple Forwarding",
      "description": "Forward notifications to external URL without enrichment",
      "category": "forwarding",
      "requiredParams": ["url"],
      "optionalParams": [],
      "exampleClientState": "destination:forward|url:https://webhook.site/abc123"
    },
    {
      "id": "forward-with-changes",
      "name": "Forward with Change Detection",
      "description": "Forward notifications with before/after comparison",
      "category": "forwarding",
      "requiredParams": ["url"],
      "optionalParams": ["includeFields", "excludeFields"],
      "exampleClientState": "destination:forward|url:https://webhook.site/abc|changeDetection:enabled"
    }
  ]
}
```

**Acceptance Criteria:**
- [ ] Returns all registered handlers/templates
- [ ] Includes detailed metadata for each template
- [ ] Categorizes by destination type
- [ ] Provides example clientState for each
- [ ] Includes use cases and triggers where applicable
- [ ] Response time < 200ms

---

#### REQ-API-003: ClientState Validation Endpoint
**Priority:** Medium
**Status:** Required

**Endpoint:** `POST /api/validate-clientstate`

**Request Payload:**
```json
{
  "clientState": "destination:uipath|handler:document|queue:FIN_SCAN|tenant:PROD|folder:INVALID"
}
```

**Response Payload:**
```json
{
  "valid": false,
  "errors": [
    {
      "field": "folder",
      "message": "Folder ID 'INVALID' is not a valid number",
      "suggestion": "Use a numeric folder ID like '606837' or '277500'"
    }
  ],
  "warnings": [
    {
      "field": "queue",
      "message": "Queue 'FIN_SCAN' not found in folder 606837 (PROD tenant)",
      "suggestion": "Verify queue exists or check folder ID",
      "severity": "medium"
    }
  ],
  "parsed": {
    "destination": "uipath",
    "handler": "document",
    "queue": "FIN_SCAN",
    "tenant": "PROD",
    "folder": "INVALID"
  },
  "description": "Routes documents to UiPath PROD tenant folder INVALID, queue FIN_SCAN"
}
```

**Validation Checks:**
1. Syntax validation (proper format, required fields)
2. Type validation (folder is numeric, tenant is DEV/PROD)
3. UiPath queue existence check (warning if not found)
4. Handler existence check (error if handler not registered)
5. Parameter compatibility (e.g., can't use `queue` with `destination:forward`)

**Acceptance Criteria:**
- [ ] Validates clientState syntax
- [ ] Returns detailed error messages
- [ ] Provides actionable suggestions
- [ ] Checks queue existence asynchronously (warning only)
- [ ] Response time < 1000ms

---

### 2.3 Auto-Generated Descriptions

#### REQ-DESC-001: Human-Readable Webhook Descriptions
**Priority:** High
**Status:** Required

**Requirement:**
Automatically generate human-readable descriptions for all webhooks based on their clientState configuration.

**Examples:**

| ClientState | Generated Description |
|-------------|----------------------|
| `destination:uipath\|handler:document\|queue:FIN_SCAN\|tenant:PROD\|folder:606837` | 📄 Document processor → UiPath PROD (folder 606837) → Queue: FIN_SCAN |
| `destination:forward\|url:https://webhook.site/abc\|changeDetection:enabled` | 🔄 Forward to webhook.site with change detection |
| `destination:uipath\|handler:costco\|queue:COSTCO_Queue\|tenant:DEV\|folder:277500` | 📦 COSTCO routing → UiPath DEV (folder 277500) → Queue: COSTCO_Queue |

**Storage:**
Add `description` field to SharePoint webhook tracking list and API responses.

**Acceptance Criteria:**
- [ ] Description generated automatically on webhook creation
- [ ] Description updated on clientState changes
- [ ] Description stored in tracking list
- [ ] Description included in API responses
- [ ] Emoji indicators for quick visual identification
- [ ] Maximum description length: 200 characters

---

#### REQ-DESC-002: Tagging System
**Priority:** Low
**Status:** Optional

**Requirement:**
Auto-generate tags for webhooks to enable filtering and categorization.

**Tag Examples:**
- `destination:uipath` → tags: `["uipath", "prod", "documents"]`
- `destination:forward` → tags: `["forwarding", "external"]`
- `handler:costco` → tags: `["costco", "routing"]`

**Acceptance Criteria:**
- [ ] Tags generated from clientState
- [ ] Tags stored in tracking list
- [ ] Webhook list API supports filtering by tags
- [ ] Maximum 10 tags per webhook

---

### 2.4 Backward Compatibility

#### REQ-COMPAT-001: Dual-Format Parser
**Priority:** Critical
**Status:** Required

**Requirement:**
Support both old and new clientState formats indefinitely to prevent breaking existing webhooks.

**Parser Behavior:**
```javascript
// Detects format automatically
parseClientState("processor:uipath;processor:document;uipath:Queue;env:PROD;folder:606837")
// → Normalizes to internal format

parseClientState("destination:uipath|handler:document|queue:Queue|tenant:PROD|folder:606837")
// → Normalizes to same internal format
```

**Detection Logic:**
- Contains `processor:` → Old format
- Contains `destination:` → New format
- Separator `;` → Old format
- Separator `|` → New format

**Acceptance Criteria:**
- [ ] Parser accepts both formats
- [ ] Both formats normalize to identical internal structure
- [ ] No performance degradation (<5ms parsing time)
- [ ] Comprehensive test coverage for both formats
- [ ] All existing webhooks continue working unchanged

---

#### REQ-COMPAT-002: Migration Utility (Optional)
**Priority:** Low
**Status:** Optional

**Requirement:**
Provide utility to migrate existing webhooks from old to new format.

**Endpoint:** `POST /api/migrate-webhook-format`

**Request:**
```json
{
  "subscriptionId": "01a8a52c-b557-4c77-8111-aa1ef822a70a",
  "dryRun": true
}
```

**Response:**
```json
{
  "subscriptionId": "01a8a52c-b557-4c77-8111-aa1ef822a70a",
  "oldClientState": "processor:uipath;processor:document;uipath:FIN_SCAN;env:PROD;folder:606837",
  "newClientState": "destination:uipath|handler:document|queue:FIN_SCAN|tenant:PROD|folder:606837",
  "updated": false,
  "dryRun": true
}
```

**Acceptance Criteria:**
- [ ] Converts old format to new format
- [ ] Validates conversion correctness
- [ ] Supports dry-run mode
- [ ] Updates tracking list when not dry-run
- [ ] Preserves all functionality

---

## 3. Non-Functional Requirements

### 3.1 Performance

#### REQ-PERF-001: API Response Times
**Priority:** High

| Endpoint | Target Response Time | Max Response Time |
|----------|---------------------|-------------------|
| `/api/webhook-config-builder` | < 300ms | < 500ms |
| `/api/webhook-templates` | < 100ms | < 200ms |
| `/api/validate-clientstate` | < 500ms | < 1000ms |
| ClientState parser | < 5ms | < 10ms |

**Acceptance Criteria:**
- [ ] 95th percentile within target response time
- [ ] 99th percentile within max response time
- [ ] Load testing confirms performance under 100 concurrent requests

---

#### REQ-PERF-002: No Impact on Existing Performance
**Priority:** Critical

**Requirement:**
New features must not degrade existing webhook processing performance.

**Metrics:**
- Webhook processing time remains < 2s end-to-end
- Parser overhead < 5ms additional per request
- Memory footprint increase < 10MB

**Acceptance Criteria:**
- [ ] Benchmark tests show no regression
- [ ] Memory profiling shows acceptable overhead
- [ ] Existing webhook processing time unchanged

---

### 3.2 Reliability

#### REQ-REL-001: Backward Compatibility Guarantee
**Priority:** Critical

**Requirement:**
Zero breaking changes to existing webhooks. All webhooks created with old format must continue functioning identically.

**Acceptance Criteria:**
- [ ] All existing webhooks tested and verified working
- [ ] Automated regression test suite passes
- [ ] No changes to webhook processing logic for old format
- [ ] Rollback plan documented and tested

---

#### REQ-REL-002: Graceful Degradation
**Priority:** High

**Requirement:**
If new API endpoints fail, webhook processing must continue unaffected.

**Scenarios:**
- Config builder API down → webhooks still process
- Templates catalog API down → webhooks still process
- Validation API down → webhooks still process (users create manually)

**Acceptance Criteria:**
- [ ] New APIs are optional, not critical path
- [ ] Webhook processing has zero dependencies on new APIs
- [ ] Failure of new APIs logged but doesn't impact operations

---

### 3.3 Security

#### REQ-SEC-001: Input Validation
**Priority:** High

**Requirement:**
All API endpoints must validate and sanitize inputs to prevent injection attacks.

**Validation Rules:**
1. ClientState strings max length: 2000 characters
2. Queue names: alphanumeric + `_` only
3. Folder IDs: numeric only
4. URLs: valid HTTPS URLs only (for forwarding)
5. No SQL injection vectors
6. No XSS vectors in generated descriptions

**Acceptance Criteria:**
- [ ] Input validation on all endpoints
- [ ] Malicious input rejected with 400 Bad Request
- [ ] Security scan passes (OWASP Top 10)
- [ ] Penetration testing completed

---

#### REQ-SEC-002: Authorization
**Priority:** Medium

**Requirement:**
New API endpoints must respect existing authentication/authorization mechanisms.

**Acceptance Criteria:**
- [ ] Endpoints require function key or Azure AD token
- [ ] Same authentication as existing webhook endpoints
- [ ] Rate limiting applied (100 req/min per IP)

---

### 3.4 Maintainability

#### REQ-MAINT-001: Code Documentation
**Priority:** Medium

**Requirement:**
All new code must be well-documented with inline comments and JSDoc.

**Standards:**
- JSDoc for all public functions
- Inline comments for complex logic
- README for new modules
- API documentation (OpenAPI/Swagger spec)

**Acceptance Criteria:**
- [ ] 100% of public functions have JSDoc
- [ ] Complex algorithms have explanation comments
- [ ] API documentation generated from OpenAPI spec
- [ ] Code review passes documentation requirements

---

#### REQ-MAINT-002: Test Coverage
**Priority:** High

**Requirement:**
Achieve minimum 80% test coverage for all new code.

**Test Types:**
- Unit tests for parsers and validators
- Integration tests for API endpoints
- End-to-end tests for full workflows
- Regression tests for backward compatibility

**Acceptance Criteria:**
- [ ] 80%+ unit test coverage
- [ ] 100% coverage of parser logic
- [ ] Integration tests for all new endpoints
- [ ] Backward compatibility tests for both formats

---

### 3.5 Usability

#### REQ-UX-001: Documentation Quality
**Priority:** High

**Requirement:**
Comprehensive, clear documentation for all new features.

**Documentation Deliverables:**
1. User guide with examples
2. API reference documentation
3. Migration guide (old → new format)
4. Troubleshooting guide
5. Video tutorial (optional)

**Acceptance Criteria:**
- [ ] All docs published and accessible
- [ ] Examples for every use case
- [ ] Step-by-step migration guide
- [ ] Searchable documentation site

---

#### REQ-UX-002: Error Messages
**Priority:** Medium

**Requirement:**
Error messages must be actionable and user-friendly.

**Requirements:**
- Clear description of what went wrong
- Specific field/parameter causing the error
- Suggestion for how to fix
- Link to documentation where applicable

**Examples:**

Bad:
```json
{"error": "Invalid input"}
```

Good:
```json
{
  "error": "Folder ID 'INVALID' is not a valid number",
  "field": "folder",
  "suggestion": "Use a numeric folder ID like '606837' or '277500'",
  "documentation": "https://docs.../webhook-configuration#folder-ids"
}
```

**Acceptance Criteria:**
- [ ] All error messages include field name
- [ ] All error messages include suggestion
- [ ] Validation errors include example values
- [ ] Error messages tested with real users

---

## 4. Implementation Roadmap

### 4.1 Overview

The implementation will be delivered in three phases over 4 weeks, prioritizing quick wins and maintaining backward compatibility throughout.

**Total Estimated Effort:** 3-4 weeks (1 senior engineer)
**Risk Level:** Low (no breaking changes)
**Dependencies:** None (all changes are additive)

---

### 4.2 Phase 1: Foundation & Quick Wins (Week 1)

**Goal:** Deliver immediate value with terminology improvements and dual-format parser.

#### Week 1 Tasks

| Task | Effort | Priority | Deliverable |
|------|--------|----------|-------------|
| Implement dual-format clientState parser | 1 day | Critical | `src/shared/clientstate-parser.js` |
| Add unit tests for parser (both formats) | 0.5 day | Critical | `tests/clientstate-parser.test.js` |
| Create description generator function | 0.5 day | High | `src/shared/description-generator.js` |
| Add `description` field to tracking list schema | 0.25 day | High | Updated SharePoint list |
| Update webhook creation to generate descriptions | 0.5 day | High | Modified webhook-handler |
| Backfill descriptions for existing webhooks | 0.25 day | Medium | Migration script |
| Documentation: Terminology guide | 0.5 day | High | `docs/terminology-guide.md` |
| Code review and testing | 0.5 day | Critical | QA sign-off |

**Milestone 1 Deliverables:**
- ✅ Dual-format parser deployed and tested
- ✅ All webhooks have auto-generated descriptions
- ✅ Documentation updated with new terminology
- ✅ Zero breaking changes confirmed

**Success Metrics:**
- 100% of existing webhooks continue working
- All new webhooks get auto-generated descriptions
- Parser handles both formats in <5ms

---

### 4.3 Phase 2: Helper APIs & Validation (Week 2-3)

**Goal:** Enable self-service webhook configuration with validation and templates.

#### Week 2 Tasks

| Task | Effort | Priority | Deliverable |
|------|--------|----------|-------------|
| Design OpenAPI spec for new endpoints | 0.5 day | High | `docs/api/openapi.yaml` |
| Implement templates catalog endpoint | 1 day | High | `src/functions/webhook-templates.js` |
| Create template registry system | 0.5 day | High | `src/shared/template-registry.js` |
| Register all existing handlers in registry | 0.5 day | Medium | Updated registry |
| Add integration tests for templates API | 0.5 day | High | `tests/integration/templates-api.test.js` |
| Documentation: Templates guide | 0.5 day | Medium | `docs/templates-guide.md` |

**Week 2 Milestone:**
- ✅ Templates catalog API live
- ✅ All handlers discoverable via API
- ✅ Documentation complete

#### Week 3 Tasks

| Task | Effort | Priority | Deliverable |
|------|--------|----------|-------------|
| Implement config builder endpoint | 1.5 days | High | `src/functions/webhook-config-builder.js` |
| Add UiPath queue existence check (async) | 0.5 day | Medium | Queue validator |
| Implement validation endpoint | 1 day | High | `src/functions/validate-clientstate.js` |
| Create shared validation logic | 0.5 day | High | `src/shared/clientstate-validator.js` |
| Add integration tests for new APIs | 1 day | High | Comprehensive test suite |
| Security review and penetration testing | 0.5 day | Critical | Security sign-off |
| Performance testing (load tests) | 0.5 day | High | Performance report |

**Week 3 Milestone:**
- ✅ Config builder API live
- ✅ Validation API live
- ✅ All endpoints under load tested
- ✅ Security audit passed

**Phase 2 Success Metrics:**
- Config builder creates valid clientState 100% of time
- Validation endpoint catches 95%+ of errors
- API response times meet SLAs
- No security vulnerabilities found

---

### 4.4 Phase 3: Polish & Documentation (Week 4)

**Goal:** Finalize documentation, optional features, and user onboarding.

#### Week 4 Tasks

| Task | Effort | Priority | Deliverable |
|------|--------|----------|-------------|
| Create comprehensive user guide | 1 day | High | `docs/user-guide.md` |
| Write migration guide (old → new format) | 0.5 day | High | `docs/migration-guide.md` |
| Implement tagging system (optional) | 0.5 day | Low | Tag generator |
| Create migration utility endpoint (optional) | 0.5 day | Low | Migration API |
| Record video tutorial (optional) | 1 day | Low | Video + transcript |
| Create troubleshooting guide | 0.5 day | Medium | `docs/troubleshooting.md` |
| Update CLAUDE.md with new patterns | 0.25 day | Medium | Updated AI context |
| Final end-to-end testing | 0.5 day | Critical | QA sign-off |
| Production deployment | 0.25 day | Critical | Live release |

**Phase 3 Success Metrics:**
- Documentation covers 100% of use cases
- New users can self-configure webhooks in <30 minutes
- Migration guide tested with real webhooks
- Video tutorial views >50 in first month

---

### 4.5 Milestones & Gates

#### Milestone 1: Parser & Descriptions (End of Week 1)
**Gate Criteria:**
- [ ] All existing webhooks tested and working
- [ ] Dual-format parser passes 100% of tests
- [ ] Every webhook has auto-generated description
- [ ] Performance benchmarks show no regression
- [ ] Code review approved
- [ ] Documentation published

**Go/No-Go:** Must pass all gate criteria before proceeding to Phase 2

---

#### Milestone 2: Helper APIs (End of Week 3)
**Gate Criteria:**
- [ ] All three APIs deployed to production
- [ ] APIs pass integration tests
- [ ] Load testing confirms performance SLAs
- [ ] Security audit passed
- [ ] No breaking changes to existing webhooks
- [ ] API documentation complete

**Go/No-Go:** Must pass all gate criteria before proceeding to Phase 3

---

#### Milestone 3: Production Release (End of Week 4)
**Gate Criteria:**
- [ ] User guide published and reviewed
- [ ] Migration guide tested with real webhooks
- [ ] All acceptance criteria met
- [ ] Support team trained on new features
- [ ] Rollback plan documented and tested
- [ ] Stakeholder sign-off obtained

**Release Approval:** Final sign-off from engineering lead and product owner

---

### 4.6 Resource Requirements

#### Personnel

| Role | Time Commitment | Responsibilities |
|------|----------------|------------------|
| Senior Full-Stack Engineer | 4 weeks full-time | Implementation, testing, deployment |
| QA Engineer | 1 week (distributed) | Testing, validation, regression testing |
| Technical Writer | 3 days (distributed) | Documentation, user guide, video script |
| DevOps Engineer | 2 days (distributed) | Deployment, monitoring setup |
| Product Owner | 5% availability | Requirements clarification, sign-off |

#### Infrastructure

- **Development Environment:** Existing Azure Function App (webhook-functions-sharepoint-002)
- **Testing Environment:** Separate function app for integration testing (recommended)
- **Monitoring:** Application Insights (already configured)
- **Storage:** No additional storage needed
- **Compute:** No additional compute resources needed

**Estimated Cost:** $0 additional infrastructure cost (uses existing resources)

---

### 4.7 Risk Assessment & Mitigation

#### High Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking changes to existing webhooks | Critical | Low | Comprehensive regression testing; dual-format parser ensures compatibility; rollback plan |
| Parser performance degradation | High | Low | Performance benchmarks required before merge; load testing in Phase 2 |
| Security vulnerabilities in new APIs | High | Medium | Security review in Week 3; input validation on all endpoints; rate limiting |

#### Medium Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| User confusion during transition | Medium | Medium | Clear documentation; both formats supported indefinitely; migration guide |
| UiPath API rate limiting during validation | Medium | Medium | Implement caching; make queue checks async with warnings only |
| Incomplete template documentation | Medium | Low | Template registry requires documentation for each handler |

#### Low Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Timeline slippage | Low | Medium | Phased approach allows partial delivery; Phase 1 delivers value independently |
| Video tutorial production delays | Low | Medium | Mark as optional; can be delivered post-launch |

---

### 4.8 Testing Strategy

#### Unit Testing
- **Target Coverage:** 80% overall, 100% for parser logic
- **Tools:** Jest, Mocha
- **Focus Areas:**
  - ClientState parser (both formats)
  - Description generator
  - Validation logic

#### Integration Testing
- **Scope:** All new API endpoints
- **Test Scenarios:**
  - Config builder creates valid clientState
  - Templates catalog returns all handlers
  - Validation endpoint catches all error types
  - Old format webhooks continue working

#### Regression Testing
- **Critical:** Test all existing webhooks with both old and new code
- **Automated:** Create test suite of representative webhooks
- **Manual:** Test in development environment before production

#### Performance Testing
- **Load Tests:** 100 concurrent requests to each endpoint
- **Benchmarks:** Parser must complete in <5ms
- **Monitoring:** Track p95 and p99 response times

#### Security Testing
- **OWASP Top 10:** SQL injection, XSS, CSRF tests
- **Penetration Testing:** External security review (Week 3)
- **Rate Limiting:** Verify 100 req/min limit enforced

---

### 4.9 Deployment Strategy

#### Deployment Approach: Blue-Green

**Rationale:** Zero-downtime deployment with instant rollback capability

**Steps:**
1. Deploy new code to staging slot
2. Run smoke tests on staging
3. Swap staging → production
4. Monitor for 1 hour
5. If issues detected, instant rollback (swap back)

#### Rollback Plan

**Trigger Conditions:**
- Any existing webhook fails
- Performance degradation >20%
- Security incident detected
- Critical bug in new APIs

**Rollback Procedure:**
1. Swap production slot back to previous version (< 1 minute)
2. Verify existing webhooks working
3. Investigate root cause
4. Fix and redeploy when ready

**Rollback SLA:** <5 minutes from detection to rollback completion

---

### 4.10 Success Criteria

#### Immediate Success (Week 1)
- ✅ Zero breaking changes to existing webhooks
- ✅ 100% of webhooks have descriptions
- ✅ Parser handles both formats correctly

#### Short-Term Success (Week 4)
- ✅ All new APIs deployed and operational
- ✅ User guide published
- ✅ Support team trained
- ✅ First 5 webhooks created using new format

#### Long-Term Success (3 months)
- 📊 50% reduction in configuration-related support tickets
- 📊 80% of new webhooks use config builder API
- 📊 Zero incidents related to clientState parsing
- 📊 <30 minute average time for new users to configure first webhook
- 📊 Documentation satisfaction score >4.5/5

---

### 4.11 Post-Launch Monitoring

#### Metrics to Track

| Metric | Tool | Frequency | Alert Threshold |
|--------|------|-----------|----------------|
| Webhook processing success rate | Application Insights | Real-time | <99% |
| API response times (p95) | Application Insights | Real-time | >500ms |
| Parser errors | Application Insights | Daily | >5 errors/day |
| Config builder usage | Custom telemetry | Weekly | Track adoption |
| Support ticket volume | Ticketing system | Weekly | >10% increase |

#### Post-Launch Review

**When:** 2 weeks after Phase 3 completion
**Attendees:** Engineering team, product owner, support team
**Agenda:**
1. Review success metrics
2. Analyze support tickets
3. Gather user feedback
4. Identify improvement opportunities
5. Plan any necessary iterations

---

### 4.12 Dependencies & Assumptions

#### Dependencies
- **None:** All changes are additive and self-contained
- **External APIs:** UiPath Orchestrator (for queue validation) - non-blocking

#### Assumptions
1. Existing webhook functionality remains stable
2. SharePoint API rate limits not exceeded
3. Azure Function App performance is adequate
4. Support team available for training in Week 4
5. No major architectural changes needed to existing code

---

## 5. Appendices

### 5.1 Example Use Cases

#### Use Case 1: New User Creates Document Processing Webhook

**Scenario:** Finance team wants to process invoices uploaded to SharePoint

**Steps:**
1. User calls `/api/webhook-templates` to discover available handlers
2. Finds `document` handler suitable for their needs
3. Calls `/api/webhook-config-builder` with:
   ```json
   {
     "destination": "uipath",
     "handler": "document",
     "queue": "Invoice_Processing",
     "tenant": "PROD",
     "folder": "606837"
   }
   ```
4. Receives validated clientState: `destination:uipath|handler:document|queue:Invoice_Processing|tenant:PROD|folder:606837`
5. Creates webhook via `/api/subscription-manager` with generated clientState
6. Webhook appears in tracking list with description: "📄 Document processor → UiPath PROD (folder 606837) → Queue: Invoice_Processing"

**Expected Outcome:** Webhook created correctly on first attempt, no support needed

---

#### Use Case 2: Existing Webhook Continues Working

**Scenario:** COSTCO routing webhook created before improvements

**Current ClientState:**
```
processor:uipath;processor:costco;uipath:COSTCO_Queue;env:DEV;folder:277500
```

**After Deployment:**
- Parser automatically detects old format
- Normalizes to internal structure
- Webhook processes notifications identically
- Description auto-generated: "📦 COSTCO routing → UiPath DEV (folder 277500) → Queue: COSTCO_Queue"

**Expected Outcome:** Zero impact, webhook continues working exactly as before

---

#### Use Case 3: User Validates ClientState Before Creation

**Scenario:** User wants to verify their configuration before creating webhook

**Steps:**
1. User manually constructs clientState (or gets it from config builder)
2. Calls `/api/validate-clientstate` with:
   ```json
   {
     "clientState": "destination:uipath|handler:document|queue:NonExistentQueue|tenant:PROD|folder:606837"
   }
   ```
3. Receives validation response:
   ```json
   {
     "valid": true,
     "errors": [],
     "warnings": [
       {
         "field": "queue",
         "message": "Queue 'NonExistentQueue' not found in folder 606837",
         "severity": "medium"
       }
     ]
   }
   ```
4. User corrects queue name and re-validates
5. Creates webhook with confidence

**Expected Outcome:** User catches error before creating webhook, saving time

---

### 5.2 Glossary

| Term | Definition |
|------|------------|
| **ClientState** | Configuration string stored with webhook subscription that determines how notifications are processed |
| **Handler** | Processing template that defines how webhook notifications are handled (e.g., document, costco, forward) |
| **Destination** | Where notifications are routed (e.g., uipath, forward) |
| **Tenant** | UiPath environment (DEV or PROD) |
| **Folder** | UiPath organization unit ID where queue resides |
| **Change Detection** | Feature that compares current item state with previous state to identify what changed |
| **Dual-Format Parser** | Parser that accepts both old and new clientState formats |
| **Template Registry** | System that catalogs all available handlers with metadata |

---

### 5.3 References

1. **Existing Documentation:**
   - `docs/WEBHOOK_UX_IMPROVEMENT_REQUIREMENTS.md` (this document)
   - `docs/guides/VISITOR_ONBOARDING_GUIDE.md`
   - `docs/guides/uipath/main-guide.md`
   - `docs/api/ENHANCED_FORWARDING.md`

2. **Related Code:**
   - `src/shared/clientstate-parser.js` (to be created)
   - `src/shared/uipath-environment-config.js`
   - `src/templates/generic-document-processor.js`
   - `src/templates/costco-inline-routing.js`

3. **External References:**
   - [Microsoft Graph API - SharePoint Webhooks](https://learn.microsoft.com/en-us/graph/webhooks)
   - [UiPath Orchestrator API](https://docs.uipath.com/orchestrator/reference)

---

## Document Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Engineering Lead | _____________ | _____________ | ______ |
| Product Owner | _____________ | _____________ | ______ |
| QA Lead | _____________ | _____________ | ______ |
| Operations Manager | _____________ | _____________ | ______ |

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-10 | Engineering Team | Initial draft created |

---

**Next Steps:**
1. Review and approve this requirements document
2. Create implementation tickets in project management system
3. Schedule Phase 1 kickoff meeting
4. Begin Week 1 development