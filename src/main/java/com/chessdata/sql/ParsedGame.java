package com.chessdata.sql;

import java.util.List;

public class ParsedGame {

    private String openingName;
    private String ecoCode;
    private String result;
    private List<String> sanMoves;

    public ParsedGame(String openingName, String ecoCode, String result, List<String> sanMoves) {
        this.openingName = openingName;
        this.ecoCode = ecoCode;
        this.result = result;
        this.sanMoves = sanMoves;
    }

    public String getOpeningName() {
        return openingName;
    }

    public String getEcoCode() {
        return ecoCode;
    }

    public String getResult() {
        return result;
    }

    public List<String> getSanMoves() {
        return sanMoves;
    }
}