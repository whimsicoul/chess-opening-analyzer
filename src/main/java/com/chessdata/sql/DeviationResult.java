package com.chessdata.sql;

public class DeviationResult {

    private int moveNumber;
    private String moveUci;
    private int positionId;
    private int deviationDepth;
    private int lineDepth;
    private double completionPercentage;
    private boolean opponentDeviation; // ✅ NEW

    public DeviationResult(int moveNumber,
                           String moveUci,
                           int positionId,
                           int deviationDepth,
                           int lineDepth,
                           double completionPercentage,
                           boolean opponentDeviation) {

        this.moveNumber = moveNumber;
        this.moveUci = moveUci;
        this.positionId = positionId;
        this.deviationDepth = deviationDepth;
        this.lineDepth = lineDepth;
        this.completionPercentage = completionPercentage;
        this.opponentDeviation = opponentDeviation; // ✅ NEW
    }

    public int getMoveNumber() {
        return moveNumber;
    }

    public String getMoveUci() {
        return moveUci;
    }

    public int getPositionId() {
        return positionId;
    }

    public int getDeviationDepth() {
        return deviationDepth;
    }

    public int getLineDepth() {
        return lineDepth;
    }

    public double getCompletionPercentage() {
        return completionPercentage;
    }

    // ✅ NEW getter
    public boolean isOpponentDeviation() {
        return opponentDeviation;
    }
}