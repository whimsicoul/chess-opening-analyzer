package com.chessdata.sql;

public class DeviationResult {

    private int moveNumber;
    private String moveSan;           // renamed from moveUci — this has always been SAN format
    private int positionId;
    private int deviationDepth;
    private int lineDepth;
    private double completionPercentage;
    private boolean opponentDeviation;

    public DeviationResult(int moveNumber, String moveSan, int positionId,
                           int deviationDepth, int lineDepth,
                           double completionPercentage, boolean opponentDeviation) {
        this.moveNumber          = moveNumber;
        this.moveSan             = moveSan;
        this.positionId          = positionId;
        this.deviationDepth      = deviationDepth;
        this.lineDepth           = lineDepth;
        this.completionPercentage = completionPercentage;
        this.opponentDeviation   = opponentDeviation;
    }

    public int getMoveNumber()            { return moveNumber; }
    public String getMoveSan()            { return moveSan; }
    public int getPositionId()            { return positionId; }
    public int getDeviationDepth()        { return deviationDepth; }
    public int getLineDepth()             { return lineDepth; }
    public double getCompletionPercentage() { return completionPercentage; }
    public boolean isOpponentDeviation()  { return opponentDeviation; }
}
