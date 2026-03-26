# Enterprise Directory and Naming Conventions

## 1) Target Directory Structure (Three-Tier)

### Frontend (React)
```text
frontend/src/
  app/
    providers/
    router/
    store/
  domains/
    grading/
      components/
      hooks/
      services/
      types/
      pages/
    question_generator/
      components/
      hooks/
      services/
      types/
      pages/
  shared/
    components/
    hooks/
    services/
    utils/
    constants/
    types/
  assets/
  styles/
```

### AI Gateway (FastAPI)
```text
backend/
  api/
    routes/
      auth_routes.py
      teacher_routes.py
      ai_gateway_routes.py
    dependencies.py
  application/
    services/
      ai_gateway_service.py
      grading_service.py
      retrieval_service.py
  domain/
    grading/
      models.py
      value_objects.py
      policies.py
    question_generator/
      models.py
  infrastructure/
    llm/
    rag/
    persistence/
  core/
    config.py
    security.py
    exceptions.py
  schemas/
    request_models.py
    response_models.py
  main.py
```

### Java Core
```text
java-core/src/main/java/com/company/edu/
  shared/
    config/
    exception/
    util/
  grading/
    api/
      GradingController.java
    application/
      GradingApplicationService.java
    domain/
      model/
      service/
      repository/
    infrastructure/
      persistence/
      client/
    dto/
      request/
      response/
  questiongenerator/
    api/
    application/
    domain/
    infrastructure/
    dto/
```

## 2) Cross-Language Naming Contract

- React components: `PascalCase` file and symbol names, e.g. `QuestionGeneratorPanel.jsx`.
- React hooks: `useXxxYyy` in `camelCase`, file starts with `use`, e.g. `useLLMStream.ts`.
- React utility modules: `snake_case` or `camelCase`, one style per repo; recommend `snake_case` for parity with backend domain modules.
- FastAPI route files: `*_routes.py` in `snake_case`.
- FastAPI services/repositories: `*_service.py`, `*_repository.py`.
- FastAPI model/schema files: `*_schema.py` or grouped request/response files.
- Python classes: `PascalCase`; functions and variables: `snake_case`; constants: `UPPER_SNAKE_CASE`.
- Java packages: all lowercase by domain (`grading`, `questiongenerator`).
- Java classes/interfaces/enums: `PascalCase` with role suffix, e.g. `GradingRequestDto`, `SubmissionEntity`, `CozeClient`.
- Java methods/fields: `camelCase`; constants: `UPPER_SNAKE_CASE`.
- DTO suffixes are mandatory: `RequestDto`, `ResponseDto`.

## 3) Violations Found in Current Codebase

- Backend route file name mismatch:
  - `backend/routes/coze.py` (renamed to `backend/routes/ai_gateway_routes.py`)
  - `backend/routes/teacher.py` (renamed to `backend/routes/teacher_routes.py`)
- Backend service file domain naming mismatch:
  - `backend/services/coze_service.py` (renamed to `backend/services/ai_gateway_service.py`)
- Backend route symbol naming mismatch:
  - `coze_router` (renamed to `ai_gateway_router`)
- Backend class naming too vendor-coupled:
  - `CozeService` replaced with `AIGatewayService` (compat alias kept)

## 4) Refactor Rules for Future Renames

- Rename by domain first, then by technical role: `<domain>_<role>.py`.
- Keep external API path stable while refactoring internals.
- For class renames, keep a temporary compatibility alias for one release cycle.
- Enforce naming with CI lint rules and pre-commit hooks.
