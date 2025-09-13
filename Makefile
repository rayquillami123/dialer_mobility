# Makefile para atajos del CLI de administración
#
# Variables:
#   API     - URL del backend (ej: http://localhost:8080)
#   ADMIN   - Email del usuario con rol 'admin' para autenticarse
#   PASS    - Contraseña del usuario admin
#   USER    - Email del usuario objetivo para operaciones (invite, role, disable)
#   NAME    - Nombre completo para invitar a un usuario
#   ROLE    - Rol a asignar (admin, supervisor, agent, viewer)

# Valores por defecto (puedes sobreescribirlos desde la línea de comandos)
API ?= http://localhost:8080
ADMIN ?= admin@example.com
PASS ?= password
# No hay TENANT por defecto, ya que se infiere del login del admin

.PHONY: help login list-users invite role disable

help:
	@echo "Uso: make <comando> [VARIABLES]"
	@echo ""
	@echo "Comandos:"
	@echo "  login         - Verifica las credenciales del ADMIN."
	@echo "  list-users    - Lista todos los usuarios del tenant."
	@echo "  invite        - Invita a un nuevo usuario. Req: USER, opc: ROLE, NAME."
	@echo "  role          - Asigna un rol a un usuario. Req: USER, ROLE."
	@echo "  disable       - Desactiva la cuenta de un usuario. Req: USER."
	@echo ""
	@echo "Ejemplos:"
	@echo "  make login"
	@echo "  make list-users API=https://api.midominio.com ADMIN=admin@acme.com PASS='secret'"
	@echo "  make invite USER=agente1@acme.com NAME='Juan Pérez' ROLE=agent"
	@echo "  make role USER=agente1@acme.com ROLE=supervisor"
	@echo "  make disable USER=agente1@acme.com"

# --- Comandos del CLI ---

login:
	@node ops/cli/admin.mjs --api $(API) login -e $(ADMIN) -p '$(PASS)'

list-users:
	@node ops/cli/admin.mjs --api $(API) list-users -e $(ADMIN) -p '$(PASS)'

invite:
	@test -n "$(USER)" || (echo "Error: Se requiere la variable USER. Uso: make invite USER=correo@dominio.com [ROLE=rol] [NAME='Nombre']" && exit 1)
	@node ops/cli/admin.mjs --api $(API) invite-user -e $(ADMIN) -p '$(PASS)' --invite $(USER) $(if $(ROLE),-r $(ROLE)) $(if $(NAME),--name "$(NAME)")

role:
	@test -n "$(USER)" && test -n "$(ROLE)" || (echo "Error: Se requieren las variables USER y ROLE. Uso: make role USER=correo@dominio.com ROLE=agent|supervisor|admin|viewer" && exit 1)
	@node ops/cli/admin.mjs --api $(API) set-role -e $(ADMIN) -p '$(PASS)' --target $(USER) -r $(ROLE)

disable:
	@test -n "$(USER)" || (echo "Error: Se requiere la variable USER. Uso: make disable USER=correo@dominio.com" && exit 1)
	@node ops/cli/admin.mjs --api $(API) disable-user -e $(ADMIN) -p '$(PASS)' --target $(USER)
