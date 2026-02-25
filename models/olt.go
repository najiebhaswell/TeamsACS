package models

import (
	"time"
)

// OltDevice represents an OLT device for SNMP polling
type OltDevice struct {
	ID            int64     `gorm:"primaryKey" json:"id,string" form:"id"`
	Name          string    `gorm:"index" json:"name" form:"name"`
	IPAddress     string    `json:"ip_address" form:"ip_address"`
	SNMPPort      int       `json:"snmp_port" form:"snmp_port"`
	SNMPCommunity string    `json:"snmp_community" form:"snmp_community"`
	Manufacturer  string    `json:"manufacturer" form:"manufacturer"` // ZTE
	Model         string    `json:"model" form:"model"`               // C620, C320
	Status        string    `gorm:"index" json:"status" form:"status"`
	SysName       string    `json:"sys_name"`
	SysDescr      string    `json:"sys_descr"`
	SysUptime     string    `json:"sys_uptime"`
	LastPollAt    time.Time `json:"last_poll_at"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// OltOnuData stores ONU data polled from OLT via SNMP
type OltOnuData struct {
	ID           int64     `gorm:"primaryKey;autoIncrement" json:"id,string"`
	OltID        int64     `gorm:"index" json:"olt_id,string"`
	SerialNumber string    `gorm:"index" json:"serial_number"`
	PONPort      string    `json:"pon_port"`                 // e.g. gpon_olt-1/2/9
	OnuID        int       `json:"onu_id"`                   // ONU index on PON port
	OnuName      string    `json:"onu_name"`                 // ONU name from OLT
	OnuType      string    `json:"onu_type"`                 // ONU type/model
	PhaseState   string    `gorm:"index" json:"phase_state"` // working, los, offline, dyingGasp...
	RxPower      float64   `json:"rx_power"`                 // dBm
	OnlineTime   string    `json:"online_time"`              // Last online timestamp
	OfflineTime  string    `json:"offline_time"`             // Last offline timestamp
	IfIndex      int       `json:"if_index"`                 // PON interface index
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
