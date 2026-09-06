/**
 * data.js
 * ------------------------------------------------------------------
 * All graph data for the ERD viewer, isolated from index.html.
 *
 * Exposes a single global `data` object (loaded via a classic
 * <script> tag before index.html's module script runs):
 *
 *   data.workflowDiagram  - Mermaid erDiagram definition (full workflow ERD)
 *   data.formDiagram      - Mermaid erDiagram definition (forms-only ERD)
 *   data.fkTargets        - { fieldName: targetTableName } map used to
 *                            wire up clickable foreign-key navigation
 *
 * TO POINT THE VIEWER AT A DIFFERENT SCHEMA:
 *   Just edit the values below. Nothing in index.html needs to change
 *   as long as this same `data` shape is preserved.
 * ------------------------------------------------------------------
 */
const data = {
  workflowDiagram: `erDiagram
    forms ||--o{ form_editions : "has editions"
    form_editions ||--o{ form_sections : "has sections"
    form_sections ||--o{ form_fields : "has fields"
    field_types ||--o{ form_fields : "types"
    form_editions ||--o{ form_instances : "has instances"
    form_instances ||--o{ form_instance_answers : "has answers"
    form_fields ||--o{ form_instance_answers : "has answers"
    form_instances ||--o{ form_instance_attachments : "has attachments"
    workflow_step_instances ||--o{ form_instances : "has form instances"
    form_sections ||--o{ section_validations : "has validations"
    validation_rule_types ||--o{ section_validations : "has rules"
    submissions ||--o{ process_events : "has events"
    workflow_step_instances ||--o{ process_step_assignments : "has assignments"
    submissions ||--o| workflow_instances : "has workflow"
    workflow_instances ||--o{ workflow_step_instances : "has step instances"
    tags ||--o{ workflows_tags_tags : "tags"
    workflows ||--o{ workflows_tags_tags : "tagged by"
    workflow_categories ||--o{ workflows : "categorizes"
    workflows ||--o{ workflow_editions : "has editions"
    workflow_editions ||--o{ workflow_step_editions : "has step editions"
    workflow_steps ||--o{ workflow_step_editions : "has step editions"
    workflow_step_types ||--o{ workflow_step_editions : "types"
    form_editions ||--o{ workflow_step_editions : "has step editions"
    workflow_step_editions ||--o{ workflow_step_instances : "executed as"
    workflows ||--o{ workflow_steps : "defines"
    workflows ||--o{ workflow_separation_rules : "has rules"
    workflow_steps ||--o{ workflow_separation_rules : "separates"
    workflow_steps ||--o{ workflow_step_permissions : "guarded by"

    forms {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string code
        boolean isActive
        uuid currentPublishedEditionId
        jsonb label
        jsonb description
    }
    form_editions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formId FK
        int version
        string status
        timestamp publishedAt
        uuid publishedByUserId
        uuid createdFromEditionId
        int lockVersion
    }
    form_sections {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formEditionId FK
        uuid workflowStepEditionId FK
        int order
        boolean isActive
        jsonb title
        jsonb description
    }
    form_fields {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formSectionId FK
        uuid fieldTypeId FK
        string name
        string key
        int order
        boolean isRequired
        text defaultValue
        jsonb validation
        jsonb options
        jsonb visibilityRule
        jsonb label
        jsonb placeholder
        jsonb description
    }
    field_types {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        text description
        jsonb validationSchema
        jsonb defaultValidation
        jsonb label
    }
    form_instances {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid stepInstanceId FK
        uuid formEditionId FK
        int revision
        string status
        boolean isCurrent
        uuid createdByUserId
        uuid submittedByUserId
        timestamp submittedAt
        uuid reviewedByUserId
        timestamp reviewedAt
        string decision
        text decisionComment
        text decisionCommentAr
        int lockVersion
    }
    form_instance_answers {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formInstanceId FK
        uuid formFieldId FK
        string fieldKey
        jsonb value
    }
    form_instance_attachments {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formInstanceId FK
        uuid formFieldId
        string storagePath
        string originalName
        string mimeType
        bigint sizeBytes
        string checksum
        uuid uploadedByUserId
    }
    workflow_step_instances {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowInstanceId FK
        uuid workflowStepEditionId FK
        string status
        jsonb input
        jsonb output
        text error
        uuid currentFormInstanceId
        int attemptCount
        timestamp dueAt
        int lockVersion
        timestamp startedAt
        timestamp finishedAt
    }
    submissions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowInstanceId FK
        uuid applicantId
        string status
        timestamp submittedAt
        int lockVersion
    }
    process_events {
        uuid id PK
        uuid submissionId FK
        uuid stepInstanceId
        string eventType
        uuid actorUserId
        string actorType
        string fromStatus
        string toStatus
        jsonb payload
        timestamp createdAt
    }
    process_step_assignments {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid stepInstanceId FK
        uuid userId
        string assignmentType
        uuid assignedByUserId
        timestamp assignedAt
        timestamp releasedAt
        text reason
        boolean isActive
    }
    section_validations {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formSectionId FK
        uuid validationRuleTypeId FK
        string level
        jsonb fieldKeys
        jsonb params
        text errorMessage
        text errorMessageAr
    }
    validation_rule_types {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        text description
        jsonb paramsSchema
        jsonb label
    }
    workflow_instances {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowEditionId FK
        uuid submissionId FK
        string status
        uuid currentStepInstanceId
        jsonb metadata
        text error
        int lockVersion
        timestamp startedAt
        timestamp completedAt
    }
    workflows_tags_tags {
        uuid workflowsId PK,FK
        uuid tagsId PK,FK
    }
    tags {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        jsonb label
    }
    workflow_categories {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        int order
        jsonb label
        jsonb description
    }
    workflows {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string code
        uuid categoryId FK
        boolean isActive
        uuid currentPublishedEditionId
        jsonb label
        jsonb description
    }
    workflow_editions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowId FK
        int version
        string status
        timestamp publishedAt
        uuid publishedByUserId
        uuid createdFromEditionId
        int lockVersion
    }
    workflow_step_editions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowEditionId FK
        uuid workflowStepId FK
        string name
        int order
        uuid stepTypeId FK
        uuid roleId
        string scopeType
        uuid scopeId
        string scopeLabel
        uuid formEditionId FK
        jsonb config
        jsonb branchingRules
        string onFailure
        int maxRetries
        int retryDelayMs
        boolean isRequired
        int slaMinutes
        jsonb label
        jsonb description
    }
    workflow_steps {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowId FK
        string code
        text description
        boolean isActive
        jsonb label
    }
    workflow_separation_rules {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid workflowId FK
        string type
        uuid firstStepId FK
        uuid secondStepId FK
        text description
        boolean isActive
    }
    workflow_step_permissions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid roleId
        uuid workflowStepId FK
        boolean canView
        boolean canViewSubmission
        boolean canStart
        boolean canSaveDraft
        boolean canSubmit
        boolean canApprove
        boolean canReject
        boolean canReturn
        boolean canReopen
        boolean canSkip
        boolean canAssign
        boolean canComment
        boolean canViewHistory
        jsonb constraints
    }
    workflow_step_types {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        text description
        jsonb configSchema
        boolean allowsRetry
        boolean requiresProcessor
        jsonb label
    }`,
  formDiagram: `erDiagram
    forms ||--o{ form_editions : "has editions"
    form_editions ||--o{ form_sections : "has sections"
    form_sections ||--o{ form_fields : "has fields"
    field_types ||--o{ form_fields : "types"
    form_editions ||--o{ form_instances : "has instances"
    form_instances ||--o{ form_instance_answers : "has answers"
    form_fields ||--o{ form_instance_answers : "has answers"
    form_instances ||--o{ form_instance_attachments : "has attachments"
    form_sections ||--o{ section_validations : "has validations"
    validation_rule_types ||--o{ section_validations : "has rules"

    forms {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string code
        boolean isActive
        uuid currentPublishedEditionId
        jsonb label
        jsonb description
    }
    form_editions {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formId FK
        int version
        string status
        timestamp publishedAt
        uuid publishedByUserId
        uuid createdFromEditionId
        int lockVersion
    }
    form_sections {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formEditionId FK
        uuid workflowStepEditionId FK
        int order
        boolean isActive
        jsonb title
        jsonb description
    }
    form_fields {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formSectionId FK
        uuid fieldTypeId FK
        string name
        string key
        int order
        boolean isRequired
        text defaultValue
        jsonb validation
        jsonb options
        jsonb visibilityRule
        jsonb label
        jsonb placeholder
        jsonb description
    }
    field_types {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        text description
        jsonb validationSchema
        jsonb defaultValidation
        jsonb label
    }
    form_instances {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid stepInstanceId FK
        uuid formEditionId FK
        int revision
        string status
        boolean isCurrent
        uuid createdByUserId
        uuid submittedByUserId
        timestamp submittedAt
        uuid reviewedByUserId
        timestamp reviewedAt
        string decision
        text decisionComment
        text decisionCommentAr
        int lockVersion
    }
    form_instance_answers {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formInstanceId FK
        uuid formFieldId FK
        string fieldKey
        jsonb value
    }
    form_instance_attachments {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formInstanceId FK
        uuid formFieldId
        string storagePath
        string originalName
        string mimeType
        bigint sizeBytes
        string checksum
        uuid uploadedByUserId
    }
    section_validations {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        uuid formSectionId FK
        uuid validationRuleTypeId FK
        string level
        jsonb fieldKeys
        jsonb params
        text errorMessage
        text errorMessageAr
    }
    validation_rule_types {
        uuid id PK
        timestamp createdAt
        timestamp updatedAt
        string name
        text description
        jsonb paramsSchema
        jsonb label
    }`,
  fkTargets: {
  formId: 'forms',
  formEditionId: 'form_editions',
  workflowStepEditionId: 'workflow_step_editions',
  formSectionId: 'form_sections',
  fieldTypeId: 'field_types',
  stepInstanceId: 'workflow_step_instances',
  formInstanceId: 'form_instances',
  formFieldId: 'form_fields',
  workflowInstanceId: 'workflow_instances',
  submissionId: 'submissions',
  validationRuleTypeId: 'validation_rule_types',
  workflowEditionId: 'workflow_editions',
  workflowsId: 'workflows',
  tagsId: 'tags',
  categoryId: 'workflow_categories',
  workflowId: 'workflows',
  workflowStepId: 'workflow_steps',
  stepTypeId: 'workflow_step_types',
  firstStepId: 'workflow_steps',
  secondStepId: 'workflow_steps',
}
};
