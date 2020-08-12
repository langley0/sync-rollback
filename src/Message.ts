export enum MessageType {
    Invalid       = 0,
    SyncRequest   = 1,
    SyncReply     = 2,
    Input         = 3,
    QualityReport = 4,
    QualityReply  = 5,
    KeepAlive     = 6,
    InputAck      = 7,
    FrameRequest  = 8,
    FrameReply    = 9,
    
    JoinRequest   = 101,
    JoinReply     = 102,
};

export interface Message {
    type: MessageType,
    from: number;
    body: any;
}