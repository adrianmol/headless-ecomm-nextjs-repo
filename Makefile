HUB_SPEC_URL := https://hub.reprint.ro/docs/openapi.yaml

.PHONY: sync-hub-spec
# Downloads to a temp file first so a failed fetch never clobbers the committed copy.
sync-hub-spec:
	curl -fsSL $(HUB_SPEC_URL) -o openapi/hub.yaml.tmp
	mv openapi/hub.yaml.tmp openapi/hub.yaml
	git diff --stat -- openapi/hub.yaml
