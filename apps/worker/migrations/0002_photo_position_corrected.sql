-- Positions can be corrected by hand when GPS was off; remember that it happened (gps_accuracy_m keeps the original value).
ALTER TABLE photos ADD COLUMN position_corrected INTEGER NOT NULL DEFAULT 0;
