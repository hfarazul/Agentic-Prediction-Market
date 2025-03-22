import { Service, IAgentRuntime, ServiceType } from "@elizaos/core";
import { RemoteAttestationProvider } from "@elizaos/plugin-tee";

export class RemoveAttestationService extends Service {
    private provider: RemoteAttestationProvider;

    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.provider = new RemoteAttestationProvider(runtime.getSetting("TEE_MODE") || "OFF")
    }

    getInstance() {
        return RemoveAttestationService.getInstance();
    }

    static get serviceType() {
        return "TEE" as ServiceType;
    }

    async generateAttestation(info: string): Promise<any> {
        return this.provider.generateAttestation(info);
    }
}

export default RemoveAttestationService;
