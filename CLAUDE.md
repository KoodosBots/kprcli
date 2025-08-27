# Claude Code Configuration

This file contains configuration and rules for working with Claude Code on this project.

## Memory Management Rule

**IMPORTANT**: Always check and update `memory.md` at the start of each session and after completing significant work.

### Process:
1. **Session Start**: Read `memory.md` to understand project history and context
2. **During Work**: Document significant decisions, successful implementations, and key learnings
3. **Session End**: Update `memory.md` with completed work, new patterns, and important discoveries

### Why This Matters:
- Maintains continuity between development sessions
- Preserves successful approaches and technical decisions  
- Prevents repeating failed approaches
- Helps understand project architecture and infrastructure
- Documents deployment patterns and working configurations

## Project-Specific Guidelines

### Docker Environment
- Frontend: `kprcli-ui-dev` container on port 3000
- Backend: `kprcli-api-dev` container on port 8000
- Always verify containers are running with `docker ps`

### File Deployment Pattern
1. Create files locally in project directory
2. Test/validate locally if possible
3. Copy to appropriate container using `docker cp`
4. Verify deployment in container

### Technology Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Python FastAPI 
- **CLI**: Go application
- **Containerization**: Docker with docker-compose

### Design System
- Follow "augment code" branding and visual identity
- Use clean, modern UI patterns
- Maintain consistency with existing components
- Reference screenshots and existing designs

## Commands to Remember

```bash
# Check Docker status
docker ps

# Access container shell
docker exec kprcli-ui-dev sh -c "command"

# Copy files to container
docker cp "local/file" container:/path/to/file

# Check container directory
docker exec kprcli-ui-dev ls -la /app/public/
```

---
*Always consult memory.md for the most up-to-date project context and successful patterns.*