package app

const (
	ConfigSystemTitle         = "SystemTitle"
	ConfigSystemTheme         = "SystemTheme"
	ConfigSystemLoginRemark   = "SystemLoginRemark"
	ConfigSystemLoginSubtitle = "SystemLoginSubtitle"

	ConfigTR069AccessAddress           = "TR069AccessAddress"
	ConfigTR069AccessPassword          = "TR069AccessPassword"
	ConfigCpeConnectionRequestPassword = "CpeConnectionRequestPassword"
	ConfigCpeAutoRegister              = "CpeAutoRegister"
)

// Device type constants
const (
	DeviceTypeRouter  = "router"
	DeviceTypeONT     = "ont"
	DeviceTypeGateway = "gateway"
)

var DeviceTypes = []string{DeviceTypeRouter, DeviceTypeONT, DeviceTypeGateway}

var ConfigConstants = []string{
	ConfigSystemTitle,
	ConfigSystemTheme,
	ConfigSystemLoginRemark,
	ConfigSystemLoginSubtitle,
	ConfigTR069AccessAddress,
	ConfigTR069AccessPassword,
	ConfigCpeConnectionRequestPassword,
	ConfigCpeAutoRegister,
}
