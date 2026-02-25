package models

import (
	"time"
)

// OdcDevice represents an Optical Distribution Cabinet
type OdcDevice struct {
	ID        int64     `gorm:"primaryKey" json:"id,string" form:"id"`
	Name      string    `gorm:"index" json:"name" form:"name"`
	Location  string    `json:"location" form:"location"`
	Address   string    `json:"address" form:"address"`
	Latitude  string    `json:"latitude" form:"latitude"`
	Longitude string    `json:"longitude" form:"longitude"`
	Capacity  int       `json:"capacity" form:"capacity"` // splitter capacity
	OltID     int64     `gorm:"index" json:"olt_id,string" form:"olt_id"`
	PonPort   string    `json:"pon_port" form:"pon_port"` // linked PON port
	Remark    string    `json:"remark" form:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// OdpDevice represents an Optical Distribution Point
type OdpDevice struct {
	ID        int64     `gorm:"primaryKey" json:"id,string" form:"id"`
	Name      string    `gorm:"index" json:"name" form:"name"`
	OdcID     int64     `gorm:"index" json:"odc_id,string" form:"odc_id"`
	Location  string    `json:"location" form:"location"`
	Address   string    `json:"address" form:"address"`
	Latitude  string    `json:"latitude" form:"latitude"`
	Longitude string    `json:"longitude" form:"longitude"`
	Capacity  int       `json:"capacity" form:"capacity"` // port capacity
	UsedPorts int       `json:"used_ports" form:"used_ports"`
	Remark    string    `json:"remark" form:"remark"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
